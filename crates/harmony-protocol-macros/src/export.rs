use std::collections::BTreeSet;

use heck::{ToLowerCamelCase, ToShoutySnakeCase};
use proc_macro::TokenStream;
use proc_macro2::TokenStream as TokenStream2;
use quote::{format_ident, quote};
use syn::parse::{Parse, ParseStream};
use syn::punctuated::Punctuated;
use syn::{
    FnArg, GenericArgument, ItemFn, Meta, PathArguments, ReturnType, Token, Type, parse_macro_input,
};

use crate::ts;

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
    const fn label(&self) -> &'static str {
        match self {
            Self::Rpc { .. } => "rpc",
            Self::Command => "command",
            Self::Subscription { .. } => "subscription",
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

fn input_ts(func: &ItemFn, referenced: &mut BTreeSet<String>) -> String {
    let types: Vec<String> = func
        .sig
        .inputs
        .iter()
        .filter_map(|arg| match arg {
            FnArg::Typed(pat) => Some(ts::translate(&pat.ty, referenced)),
            FnArg::Receiver(_) => None,
        })
        .collect();
    match types.len() {
        0 => "void".into(),
        1 => types.into_iter().next().expect("checked length"),
        _ => format!("[{}]", types.join(", ")),
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

    let mut referenced: BTreeSet<String> = BTreeSet::new();
    let input_ts = input_ts(&func, &mut referenced);

    let mut entry = serde_json::Map::new();
    entry.insert("wire".into(), wire.into());
    entry.insert("js".into(), js_name.clone().into());
    entry.insert("kind".into(), kind.label().into());
    entry.insert("input_ts".into(), input_ts.into());
    match &kind {
        Kind::Rpc { output } => {
            entry.insert(
                "output_ts".into(),
                ts::translate(output, &mut referenced).into(),
            );
        }
        Kind::Command => {}
        Kind::Subscription { initial, chunk } => {
            entry.insert(
                "initial_ts".into(),
                ts::translate(initial, &mut referenced).into(),
            );
            entry.insert(
                "chunk_ts".into(),
                ts::translate(chunk, &mut referenced).into(),
            );
        }
    }
    if let Some(snapshot_for) = args.snapshot_for {
        entry.insert("snapshot_for".into(), snapshot_for.into());
    }
    entry.insert(
        "wasm_types".into(),
        serde_json::Value::Array(
            referenced
                .into_iter()
                .map(serde_json::Value::String)
                .collect(),
        ),
    );

    let mut json = serde_json::to_string(&serde_json::Value::Object(entry)).map_err(|e| {
        syn::Error::new_spanned(&fn_ident, format!("metadata serialization failed: {e}"))
    })?;
    json.push('\n');
    let json_bytes = json.as_bytes();
    let json_len = json_bytes.len();
    let byte_lits = json_bytes.iter().copied().map(|b| quote! { #b });

    let static_ident = format_ident!("__HARMONY_EXPORT_{}", fn_name.to_shouty_snake_case());

    let wasm_bindgen_attr: syn::Attribute = syn::parse_quote! {
        #[::wasm_bindgen::prelude::wasm_bindgen(js_name = #js_name)]
    };

    let mut emitted_fn = func;
    emitted_fn.attrs.push(wasm_bindgen_attr);

    Ok(quote! {
        #emitted_fn

        #[used]
        #[unsafe(link_section = "__harmony_protocol")]
        #[doc(hidden)]
        pub static #static_ident: [u8; #json_len] = [#(#byte_lits),*];
    })
}
