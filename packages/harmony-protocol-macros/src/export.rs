use heck::ToLowerCamelCase;
use proc_macro::TokenStream;
use proc_macro2::TokenStream as TokenStream2;
use quote::quote;
use syn::parse::{Parse, ParseStream};
use syn::punctuated::Punctuated;
use syn::{
    FnArg, GenericArgument, ItemFn, Meta, PathArguments, ReturnType, Token, Type, parse_macro_input,
};

#[derive(Default)]
struct ExportArgs {
    name: Option<String>,
    domain: Option<String>,
    action: Option<String>,
    js_name: Option<String>,
    snapshot_for: Option<String>,
    bytes_in: Option<String>,
    bytes_out: Option<String>,
}

impl Parse for ExportArgs {
    fn parse(input: ParseStream) -> syn::Result<Self> {
        let mut args = Self::default();
        let metas: Punctuated<Meta, Token![,]> = Punctuated::parse_terminated(input)?;
        for meta in metas {
            let Meta::NameValue(nv) = meta else {
                return Err(syn::Error::new_spanned(meta, "expected `key = \"value\"`"));
            };
            let ident = nv
                .path
                .get_ident()
                .ok_or_else(|| syn::Error::new_spanned(&nv.path, "expected identifier"))?;
            let value = match &nv.value {
                syn::Expr::Lit(syn::ExprLit {
                    lit: syn::Lit::Str(s),
                    ..
                }) => s.value(),
                _ => {
                    return Err(syn::Error::new_spanned(
                        &nv.value,
                        "expected string literal",
                    ));
                }
            };
            match ident.to_string().as_str() {
                "name" => args.name = Some(value),
                "domain" => args.domain = Some(value),
                "action" => args.action = Some(value),
                "js_name" => args.js_name = Some(value),
                "snapshot_for" => args.snapshot_for = Some(value),
                "bytes_in" => args.bytes_in = Some(value),
                "bytes_out" => args.bytes_out = Some(value),
                other => {
                    return Err(syn::Error::new_spanned(
                        ident,
                        format!(
                            "unknown attribute `{other}`; expected one of name, domain, action, js_name, snapshot_for, bytes_in, bytes_out"
                        ),
                    ));
                }
            }
        }
        Ok(args)
    }
}

#[allow(clippy::large_enum_variant)]
enum Kind {
    Rpc { output: Type },
    Command,
    Subscription { initial: Type, chunk: Type },
}

impl Kind {
    const fn variant_ident(&self) -> &'static str {
        match self {
            Self::Rpc { .. } => "Rpc",
            Self::Command => "Command",
            Self::Subscription { .. } => "Subscription",
        }
    }
}

fn detect_kind(ret: &ReturnType) -> syn::Result<Kind> {
    let ty = match ret {
        ReturnType::Default => {
            return Err(syn::Error::new_spanned(
                ret,
                "#[harmony_export] functions must return `Rpc<T>`, `Command`, or `Subscription<I, C>`",
            ));
        }
        ReturnType::Type(_, ty) => ty,
    };
    let Type::Path(tp) = ty.as_ref() else {
        return Err(syn::Error::new_spanned(
            ty,
            "#[harmony_export] return type must be `Rpc<T>`, `Command`, or `Subscription<I, C>`",
        ));
    };
    let seg = tp.path.segments.last().ok_or_else(|| {
        syn::Error::new_spanned(ty, "#[harmony_export] return type has no path segments")
    })?;
    match seg.ident.to_string().as_str() {
        "Rpc" => {
            let args = generic_types(&seg.arguments);
            let output = args.into_iter().next().ok_or_else(|| {
                syn::Error::new_spanned(seg, "`Rpc<T>` requires one type parameter")
            })?;
            Ok(Kind::Rpc { output })
        }
        "Command" => Ok(Kind::Command),
        "Subscription" => {
            let mut args = generic_types(&seg.arguments).into_iter();
            let initial = args.next().ok_or_else(|| {
                syn::Error::new_spanned(seg, "`Subscription<I, C>` requires two type parameters")
            })?;
            let chunk = args.next().ok_or_else(|| {
                syn::Error::new_spanned(seg, "`Subscription<I, C>` requires two type parameters")
            })?;
            Ok(Kind::Subscription { initial, chunk })
        }
        other => Err(syn::Error::new_spanned(
            &seg.ident,
            format!(
                "#[harmony_export] return type must be `Rpc<T>`, `Command`, or `Subscription<I, C>`, got `{other}`"
            ),
        )),
    }
}

fn is_unit_type(ty: &Type) -> bool {
    matches!(ty, Type::Tuple(t) if t.elems.is_empty())
}

fn generic_types(args: &PathArguments) -> Vec<Type> {
    let PathArguments::AngleBracketed(ab) = args else {
        return Vec::new();
    };
    ab.args
        .iter()
        .filter_map(|a| match a {
            GenericArgument::Type(t) => Some(t.clone()),
            _ => None,
        })
        .collect()
}

fn input_types(func: &ItemFn) -> Vec<Type> {
    func.sig
        .inputs
        .iter()
        .filter_map(|arg| match arg {
            FnArg::Typed(pat) => Some((*pat.ty).clone()),
            FnArg::Receiver(_) => None,
        })
        .collect()
}

pub fn expand(args: TokenStream, input: TokenStream) -> TokenStream {
    let args = parse_macro_input!(args as ExportArgs);
    let func = parse_macro_input!(input as ItemFn);
    match expand_inner(args, func) {
        Ok(ts) => ts.into(),
        Err(e) => e.to_compile_error().into(),
    }
}

fn expand_inner(args: ExportArgs, func: ItemFn) -> syn::Result<TokenStream2> {
    let fn_ident = func.sig.ident.clone();
    let fn_name = fn_ident.to_string();
    let kind = detect_kind(&func.sig.output)?;

    let action = args.action.unwrap_or_else(|| fn_name.clone());
    let domain = args.domain;
    let wire = args.name.unwrap_or_else(|| {
        domain
            .as_ref()
            .map_or_else(|| action.clone(), |d| format!("{d}.{action}"))
    });

    let js_name = args.js_name.unwrap_or_else(|| {
        domain
            .as_ref()
            .map_or_else(|| fn_name.clone(), |d| format!("{d}_{fn_name}"))
            .to_lower_camel_case()
    });

    let input_types = input_types(&func);
    if input_types.len() > 1 {
        return Err(syn::Error::new_spanned(
            &func.sig.inputs,
            "#[harmony_export] functions take at most one argument",
        ));
    }

    let kind_ident = syn::Ident::new(kind.variant_ident(), fn_ident.span());
    let sig = build_signature(&kind, input_types.first());

    let snapshot_for = args
        .snapshot_for
        .map_or_else(|| quote! { None }, |s| quote! { Some(#s) });
    let bytes_in = args
        .bytes_in
        .as_ref()
        .map_or_else(|| quote! { None }, |s| quote! { Some(#s) });
    let bytes_out = args
        .bytes_out
        .as_ref()
        .map_or_else(|| quote! { None }, |s| quote! { Some(#s) });

    let mut emitted_fn = func;
    let wasm_bindgen_attr: syn::Attribute = syn::parse_quote! {
        #[cfg_attr(
            feature = "web",
            ::wasm_bindgen::prelude::wasm_bindgen(js_name = #js_name)
        )]
    };
    emitted_fn.attrs.push(wasm_bindgen_attr);

    let desktop_wrapper = build_desktop_wrapper(
        &emitted_fn,
        &kind,
        &wire,
        args.bytes_in.as_deref(),
        args.bytes_out.as_deref(),
    );

    Ok(quote! {
        #emitted_fn

        #desktop_wrapper

        ::inventory::submit! {
            ::harmony_protocol::HarmonyEntry {
                wire: #wire,
                js: #js_name,
                module: ::core::module_path!(),
                kind: ::harmony_protocol::EntryKind::#kind_ident,
                snapshot_for: #snapshot_for,
                bytes_in: #bytes_in,
                bytes_out: #bytes_out,
                sig: #sig,
            }
        }
    })
}

/// Build the `sig` fn pointer for an entry. `Type::definition` both
/// returns the `DataType` and registers every transitively referenced type
/// into `Types`, so this replaces the old register-plus-string pair.
fn build_signature(kind: &Kind, input: Option<&Type>) -> TokenStream2 {
    let input = slot(input);
    let (output, initial, chunk) = match kind {
        Kind::Rpc { output } => (slot(Some(output)), quote!(None), quote!(None)),
        Kind::Command => (quote!(None), quote!(None), quote!(None)),
        Kind::Subscription { initial, chunk } => {
            (quote!(None), slot(Some(initial)), slot(Some(chunk)))
        }
    };

    quote! {
        |types: &mut ::specta::Types| ::harmony_protocol::Signature {
            input: #input,
            output: #output,
            initial: #initial,
            chunk: #chunk,
        }
    }
}

/// Unit types stay `None` — specta would otherwise emit a useless `null`
/// alias, and the renderer already prints `None` as `void`.
fn slot(ty: Option<&Type>) -> TokenStream2 {
    match ty {
        None => quote! { None },
        Some(t) if is_unit_type(t) => quote! { None },
        Some(t) => quote! { Some(<#t as ::specta::Type>::definition(types)) },
    }
}

/// Byte-bearing RPC wrapper. Tauri's response body is `Json` XOR `Raw`, so
/// bytes cannot ride the JSON envelope without degrading to a number array.
/// The declared field is moved out and pushed down a `Channel<Response>` as
/// raw bytes while the rest of the payload returns as normal JSON; the
/// frontend reassembles the two. The field travels empty on the JSON lane,
/// so the wire type is unchanged.
#[allow(clippy::too_many_arguments)]
fn build_bytes_out_wrapper(
    fn_ident: &syn::Ident,
    wrapper_ident: &syn::Ident,
    asyncness: Option<&Token![async]>,
    await_token: &TokenStream2,
    input_param: &TokenStream2,
    input_call: &TokenStream2,
    output: &Type,
    field: &str,
) -> TokenStream2 {
    let field = syn::Ident::new(field, wrapper_ident.span());
    quote! {
        #[cfg(feature = "desktop")]
        #[::tauri::command]
        pub #asyncness fn #wrapper_ident(
            #input_param,
            bytes: ::tauri::ipc::Channel<::tauri::ipc::Response>,
        ) -> ::harmony_protocol::Rpc<#output> {
            match #fn_ident(#input_call) #await_token .0 {
                Ok(mut value) => {
                    let raw = ::core::mem::take(&mut value.#field);
                    let _ = bytes.send(::tauri::ipc::Response::new(raw.0));
                    ::harmony_protocol::Rpc::ok(value)
                }
                Err(error) => ::harmony_protocol::Rpc::err(error),
            }
        }
    }
}

/// Byte-bearing RPC input. Tauri's request body is `Json` XOR `Raw`, so the
/// bytes ride the raw body while the rest of the input arrives as JSON in an
/// `x-harmony-input` header. The declared field travels empty in that header
/// and is overwritten from the body, mirroring the outbound wrapper — so the
/// wire type is unchanged in both directions.
fn build_bytes_in_wrapper(
    fn_ident: &syn::Ident,
    wrapper_ident: &syn::Ident,
    asyncness: Option<&Token![async]>,
    await_token: &TokenStream2,
    input_ty: &Type,
    output: &Type,
    field: &str,
) -> TokenStream2 {
    let field = syn::Ident::new(field, wrapper_ident.span());
    quote! {
        #[cfg(feature = "desktop")]
        #[::tauri::command]
        pub #asyncness fn #wrapper_ident(
            request: ::tauri::ipc::Request<'_>,
        ) -> ::core::result::Result<
            ::harmony_protocol::Rpc<#output>,
            ::harmony_protocol::HarmonyError,
        > {
            let ::tauri::ipc::InvokeBody::Raw(raw) = request.body() else {
                return Ok(::harmony_protocol::Rpc::err(
                    ::harmony_protocol::HarmonyError::SerializationFailed {
                        message: "expected a raw request body".to_owned(),
                    },
                ));
            };
            let meta = request
                .headers()
                .get("x-harmony-input")
                .and_then(|value| value.to_str().ok())
                .unwrap_or("{}");
            let mut input: #input_ty = match ::serde_json::from_str(meta) {
                Ok(input) => input,
                Err(error) => {
                    return Ok(::harmony_protocol::Rpc::err(
                        ::harmony_protocol::HarmonyError::SerializationFailed {
                            message: error.to_string(),
                        },
                    ));
                }
            };
            input.#field = ::harmony_protocol::Bytes(raw.clone());
            Ok(#fn_ident(input) #await_token)
        }
    }
}

/// Emit a `#[tauri::command]` wrapper fn under `feature = "desktop"`.
///
/// The wrapper name is `wire.replace('.', '_')` so the Tauri command id
/// matches the wire name (e.g. `auth.login` -> `auth_login`). All inputs
/// are projected to a single `input: T` parameter (every `#[harmony_export]`
/// fn currently takes 0 or 1 arg) so the Tauri JSON payload is uniformly
/// `{ input, ... }` — frontend dispatch doesn't need per-name arg-name
/// plumbing.
///
/// Subscription wrappers additionally accept `subscription_id` and
/// `channel: Channel<StreamEvent<Chunk>>`, register the pump's
/// `AbortHandle` in `harmony_protocol::desktop::REGISTRY`, and return
/// `Rpc<Initial>`. Cancel flows back via `harmony_unsubscribe`.
fn build_desktop_wrapper(
    func: &ItemFn,
    kind: &Kind,
    wire: &str,
    bytes_in: Option<&str>,
    bytes_out: Option<&str>,
) -> TokenStream2 {
    let fn_ident = &func.sig.ident;
    let wrapper_name = wire.replace('.', "_");
    let wrapper_ident = syn::Ident::new(&wrapper_name, fn_ident.span());

    let asyncness = &func.sig.asyncness;
    let await_token = asyncness.map(|_| quote!(.await)).unwrap_or_default();

    // Convention check: 0 or 1 input only. Multi-arg would break the
    // single-`input` projection (and the web dispatch already assumes the
    // same convention).
    let input_ty: Option<&Type> = func.sig.inputs.iter().find_map(|arg| match arg {
        FnArg::Typed(pat) => Some(pat.ty.as_ref()),
        FnArg::Receiver(_) => None,
    });

    let (input_param, input_call) = input_ty.map_or_else(
        || (quote! {}, quote! {}),
        |ty| (quote! { input: #ty }, quote! { input }),
    );

    if let (Some(field), Kind::Rpc { output }) = (bytes_out, kind) {
        return build_bytes_out_wrapper(
            fn_ident,
            &wrapper_ident,
            asyncness.as_ref(),
            &await_token,
            &input_param,
            &input_call,
            output,
            field,
        );
    }

    if let (Some(field), Kind::Rpc { output }, Some(ty)) = (bytes_in, kind, input_ty) {
        return build_bytes_in_wrapper(
            fn_ident,
            &wrapper_ident,
            asyncness.as_ref(),
            &await_token,
            ty,
            output,
            field,
        );
    }

    match kind {
        Kind::Rpc { .. } | Kind::Command => {
            // Skip when wrapper name collides with original fn ident — the
            // original fn already lives at the wire-derived path. (No
            // current export hits this, but cheap to keep.)
            if *fn_ident == wrapper_name {
                return quote! {};
            }
            let output = &func.sig.output;
            quote! {
                #[cfg(feature = "desktop")]
                #[::tauri::command]
                pub #asyncness fn #wrapper_ident(#input_param) #output {
                    #fn_ident(#input_call) #await_token
                }
            }
        }
        Kind::Subscription { initial, chunk } => {
            let input_prefix = if input_ty.is_some() {
                quote! { #input_param, }
            } else {
                quote! {}
            };
            quote! {
                #[cfg(feature = "desktop")]
                #[::tauri::command]
                pub async fn #wrapper_ident(
                    #input_prefix
                    subscription_id: String,
                    channel: ::tauri::ipc::Channel<
                        ::harmony_protocol::desktop::StreamEvent<#chunk>
                    >,
                ) -> ::harmony_protocol::Rpc<#initial> {
                    let sub = #fn_ident(#input_call) #await_token;
                    match sub.into_parts() {
                        Ok((initial, stream)) => {
                            ::harmony_protocol::desktop::spawn_pump(
                                subscription_id,
                                stream,
                                channel,
                            );
                            ::harmony_protocol::Rpc::ok(initial)
                        }
                        Err(error) => ::harmony_protocol::Rpc::err(error),
                    }
                }
            }
        }
    }
}
