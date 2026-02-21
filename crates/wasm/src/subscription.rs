use serde::Serialize;
use wasm_bindgen::JsValue;

pub struct Subscription<T> {
    pub initial: Vec<T>,
    pub stream: web_sys::ReadableStream,
}

impl<T: Serialize> TryFrom<Subscription<T>> for JsValue {
    type Error = Self;

    fn try_from(sub: Subscription<T>) -> Result<Self, Self::Error> {
        let initial = serde_wasm_bindgen::to_value(&sub.initial)?;
        let result = js_sys::Array::new();
        result.push(&initial);
        result.push(&sub.stream);
        Ok(result.into())
    }
}
