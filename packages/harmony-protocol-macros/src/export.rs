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
                other => {
                    return Err(syn::Error::new_spanned(
                        ident,
                        format!(
                            "unknown attribute `{other}`; expected one of name, domain, action, js_name, snapshot_for"
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

fn ts_ref(ty: &Type) -> String {
    match ty {
        Type::Tuple(t) if t.elems.is_empty() => "void".into(),
        Type::Tuple(t) => {
            let inner: Vec<String> = t.elems.iter().map(ts_ref).collect();
            format!("[{}]", inner.join(", "))
        }
        Type::Reference(r) => ts_ref(&r.elem),
        Type::Paren(p) => ts_ref(&p.elem),
        Type::Group(g) => ts_ref(&g.elem),
        Type::Slice(s) => format!("{}[]", ts_ref(&s.elem)),
        Type::Array(a) => format!("{}[]", ts_ref(&a.elem)),
        Type::Path(tp) => ts_ref_path(tp),
        other => quote!(#other).to_string().split_whitespace().collect(),
    }
}

fn ts_ref_path(tp: &syn::TypePath) -> String {
    let Some(last) = tp.path.segments.last() else {
        return quote!(#tp).to_string().split_whitespace().collect();
    };
    let name = last.ident.to_string();

    if let Some(prim) = primitive(&name) {
        return prim.into();
    }

    if let PathArguments::AngleBracketed(args) = &last.arguments {
        let inner: Vec<String> = args
            .args
            .iter()
            .filter_map(|a| match a {
                GenericArgument::Type(t) => Some(ts_ref(t)),
                _ => None,
            })
            .collect();
        match (name.as_str(), inner.as_slice()) {
            ("Vec" | "VecDeque", [t]) => return format!("{t}[]"),
            ("Box" | "Rc" | "Arc", [t]) => return t.clone(),
            ("Option", [t]) => return format!("{t} | null"),
            ("Result", [ok, _]) => return ok.clone(),
            ("HashMap" | "BTreeMap", [k, v]) => return format!("Record<{k}, {v}>"),
            _ => return format!("{name}<{}>", inner.join(", ")),
        }
    }

    name
}

fn primitive(name: &str) -> Option<&'static str> {
    Some(match name {
        "String" | "str" | "char" => "string",
        "bool" => "boolean",
        "i8" | "i16" | "i32" | "i64" | "isize" | "u8" | "u16" | "u32" | "u64" | "usize" | "f32"
        | "f64" => "number",
        _ => return None,
    })
}

fn input_ts(types: &[Type]) -> String {
    match types {
        [] => "void".into(),
        [single] => ts_ref(single),
        many => {
            let inner: Vec<String> = many.iter().map(ts_ref).collect();
            format!("[{}]", inner.join(", "))
        }
    }
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
    let input_ts_str = input_ts(&input_types);

    let kind_ident = syn::Ident::new(kind.variant_ident(), fn_ident.span());

    let in_register: TokenStream2 = input_types
        .iter()
        .filter(|t| !is_unit_type(t))
        .map(|t| quote! { types.register_mut::<#t>(); })
        .collect();

    let kind_payload = build_kind_payload(&kind, &in_register, &input_ts_str);

    let snapshot_for = args
        .snapshot_for
        .map_or_else(|| quote! { None }, |s| quote! { Some(#s) });

    let mut emitted_fn = func;
    let wasm_bindgen_attr: syn::Attribute = syn::parse_quote! {
        #[cfg_attr(
            feature = "web",
            ::wasm_bindgen::prelude::wasm_bindgen(js_name = #js_name)
        )]
    };
    emitted_fn.attrs.push(wasm_bindgen_attr);

    let desktop_wrapper = build_desktop_wrapper(&emitted_fn, &kind, &wire);

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
                types: #kind_payload,
            }
        }
    })
}

/// Build the `HarmonyTypes::{Rpc,Command,Subscription}` literal that
/// populates the `types` field on an `inventory::submit!`'d
/// `HarmonyEntry`. Each arm bakes in the per-kind TS reference strings
/// and emits a `register` closure that walks every transitively
/// referenced wire type into the specta `Types` collection.
fn build_kind_payload(kind: &Kind, in_register: &TokenStream2, input_ts_str: &str) -> TokenStream2 {
    match kind {
        Kind::Rpc { output } => {
            let out_ts = ts_ref(output);
            let output_register = register_type(output);
            quote! {
                ::harmony_protocol::HarmonyTypes::Rpc {
                    input_ts: #input_ts_str,
                    output_ts: #out_ts,
                    register: |types: &mut ::specta::Types| {
                        #in_register
                        #output_register
                    },
                }
            }
        }
        Kind::Command => quote! {
            ::harmony_protocol::HarmonyTypes::Command {
                input_ts: #input_ts_str,
                register: |types: &mut ::specta::Types| {
                    #in_register
                },
            }
        },
        Kind::Subscription { initial, chunk } => {
            let initial_ts = ts_ref(initial);
            let chunk_ts = ts_ref(chunk);
            let initial_register = register_type(initial);
            let chunk_register = register_type(chunk);
            quote! {
                ::harmony_protocol::HarmonyTypes::Subscription {
                    input_ts: #input_ts_str,
                    initial_ts: #initial_ts,
                    chunk_ts: #chunk_ts,
                    register: |types: &mut ::specta::Types| {
                        #in_register
                        #initial_register
                        #chunk_register
                    },
                }
            }
        }
    }
}

/// `types.register_mut::<#ty>();` (or empty for `()`). Skipping unit
/// types avoids specta emitting a useless `null` alias.
fn register_type(ty: &Type) -> TokenStream2 {
    if is_unit_type(ty) {
        quote! {}
    } else {
        quote! { types.register_mut::<#ty>(); }
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
fn build_desktop_wrapper(func: &ItemFn, kind: &Kind, wire: &str) -> TokenStream2 {
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
