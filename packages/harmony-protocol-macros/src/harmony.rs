use proc_macro::TokenStream;
use proc_macro2::TokenStream as TokenStream2;
use quote::quote;
use syn::{DeriveInput, parse_macro_input};

pub fn expand(_args: TokenStream, input: TokenStream) -> TokenStream {
    let item = parse_macro_input!(input as DeriveInput);
    match expand_inner(&item) {
        Ok(ts) => ts.into(),
        Err(e) => e.to_compile_error().into(),
    }
}

fn expand_inner(item: &DeriveInput) -> syn::Result<TokenStream2> {
    if !item.generics.params.is_empty() {
        return Err(syn::Error::new_spanned(
            &item.generics,
            "#[harmony] does not support generic types; use `#[derive(serde::Serialize, serde::Deserialize, specta::Type)]` directly",
        ));
    }

    let ident = &item.ident;
    let ident_str = ident.to_string();
    let js_alias = syn::Ident::new(&format!("Js{ident}"), ident.span());

    let default_rename = if matches!(item.data, syn::Data::Enum(_)) {
        quote! { #[serde(rename_all = "camelCase", rename_all_fields = "camelCase")] }
    } else {
        quote! { #[serde(rename_all = "camelCase")] }
    };

    Ok(quote! {
        #[derive(::serde::Serialize, ::serde::Deserialize, ::specta::Type)]
        #default_rename
        #item

        #[cfg(feature = "web")]
        const _: () = {
            use ::wasm_bindgen::convert::{FromWasmAbi, IntoWasmAbi};
            use ::wasm_bindgen::describe::WasmDescribe;
            use ::wasm_bindgen::JsValue;

            #[::wasm_bindgen::prelude::wasm_bindgen]
            extern "C" {
                #[::wasm_bindgen::prelude::wasm_bindgen(typescript_type = #ident_str)]
                pub type #js_alias;
            }

            impl IntoWasmAbi for #ident {
                type Abi = <JsValue as IntoWasmAbi>::Abi;
                fn into_abi(self) -> Self::Abi {
                    ::serde_wasm_bindgen::to_value(&self)
                        .unwrap_or(JsValue::UNDEFINED)
                        .into_abi()
                }
            }

            impl FromWasmAbi for #ident {
                type Abi = <JsValue as FromWasmAbi>::Abi;
                unsafe fn from_abi(js: Self::Abi) -> Self {
                    let val = unsafe { JsValue::from_abi(js) };
                    ::serde_wasm_bindgen::from_value(val)
                        .expect(concat!(stringify!(#ident), " deserialization"))
                }
            }

            impl WasmDescribe for #ident {
                fn describe() {
                    <#js_alias as WasmDescribe>::describe();
                }
            }
        };
    })
}
