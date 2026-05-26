use std::collections::BTreeSet;

use quote::ToTokens;
use syn::{GenericArgument, PathArguments, Type, TypePath};

/// Translates a Rust type to a TypeScript type string.
///
/// Records any non-primitive identifiers (likely tsify-generated structs
/// emitted by `@harmony/wasm`) into `referenced` so the codegen tool can
/// build an import block for the generated maps file.
pub fn translate(ty: &Type, referenced: &mut BTreeSet<String>) -> String {
    match ty {
        Type::Tuple(t) if t.elems.is_empty() => "void".into(),
        Type::Tuple(t) => {
            let inner: Vec<String> = t.elems.iter().map(|e| translate(e, referenced)).collect();
            format!("[{}]", inner.join(", "))
        }
        Type::Reference(r) => translate(&r.elem, referenced),
        Type::Paren(p) => translate(&p.elem, referenced),
        Type::Group(g) => translate(&g.elem, referenced),
        Type::Slice(s) => format!("{}[]", translate(&s.elem, referenced)),
        Type::Array(a) => format!("{}[]", translate(&a.elem, referenced)),
        Type::Path(tp) => translate_path(tp, referenced),
        other => fallback_token_string(other),
    }
}

fn translate_path(tp: &TypePath, referenced: &mut BTreeSet<String>) -> String {
    let Some(last) = tp.path.segments.last() else {
        return fallback_token_string(tp);
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
                GenericArgument::Type(t) => Some(translate(t, referenced)),
                _ => None,
            })
            .collect();
        match (name.as_str(), inner.as_slice()) {
            ("Vec" | "VecDeque", [t]) => return format!("{t}[]"),
            ("Box" | "Rc" | "Arc", [t]) => return t.clone(),
            ("Option", [t]) => return format!("{t} | null"),
            ("Result", [ok, _]) => return ok.clone(),
            ("HashMap" | "BTreeMap", [k, v]) => return format!("Record<{k}, {v}>"),
            _ => {
                referenced.insert(name.clone());
                return format!("{name}<{}>", inner.join(", "));
            }
        }
    }

    referenced.insert(name.clone());
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

fn fallback_token_string<T: ToTokens>(value: &T) -> String {
    value
        .to_token_stream()
        .to_string()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join("")
}
