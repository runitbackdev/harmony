use std::marker::PhantomData;

use serde::Serialize;
use wasm_bindgen::JsValue;
use wasm_bindgen::describe::WasmDescribe;

use crate::error::HarmonyError;

/// Request/response bridge call. Serialized to JS as
/// `{ ok: true, value: T } | { ok: false, error: HarmonyError }`.
#[must_use]
pub struct Rpc<T: Serialize>(pub Result<T, HarmonyError>);

impl<T: Serialize> Rpc<T> {
    pub const fn ok(value: T) -> Self {
        Self(Ok(value))
    }

    pub const fn err(error: HarmonyError) -> Self {
        Self(Err(error))
    }
}

impl<T, E> From<Result<T, E>> for Rpc<T>
where
    T: Serialize,
    E: Into<HarmonyError>,
{
    fn from(value: Result<T, E>) -> Self {
        Self(value.map_err(Into::into))
    }
}

/// Fire-and-forget bridge call. Errors are logged in the worker and
/// dropped; callers needing acknowledgement should use `Rpc<()>`.
#[must_use]
pub struct Command(pub Result<(), HarmonyError>);

impl Command {
    pub const fn ok() -> Self {
        Self(Ok(()))
    }

    pub const fn err(error: HarmonyError) -> Self {
        Self(Err(error))
    }
}

impl<E> From<Result<(), E>> for Command
where
    E: Into<HarmonyError>,
{
    fn from(value: Result<(), E>) -> Self {
        Self(value.map_err(Into::into))
    }
}

/// Subscription bridge call.
///
/// Carries either a successful startup (initial snapshot + stream of
/// chunks) or a startup error. `PhantomData<C>` records the chunk type
/// for the macro and codegen; the actual stream is type-erased at the
/// wasm-bindgen boundary.
///
/// Mid-stream errors close the subscription on the worker side; only
/// startup errors are surfaced through this wrapper.
#[must_use]
pub struct Subscription<I: Serialize, C> {
    inner: Result<SubscriptionOk<I, C>, HarmonyError>,
}

struct SubscriptionOk<I: Serialize, C> {
    initial: I,
    stream: web_sys::ReadableStream,
    _chunk: PhantomData<C>,
}

impl<I: Serialize, C> Subscription<I, C> {
    pub const fn ok(initial: I, stream: web_sys::ReadableStream) -> Self {
        Self {
            inner: Ok(SubscriptionOk {
                initial,
                stream,
                _chunk: PhantomData,
            }),
        }
    }

    pub const fn err(error: HarmonyError) -> Self {
        Self { inner: Err(error) }
    }
}

impl<I, C, E> From<Result<(I, web_sys::ReadableStream), E>> for Subscription<I, C>
where
    I: Serialize,
    E: Into<HarmonyError>,
{
    fn from(value: Result<(I, web_sys::ReadableStream), E>) -> Self {
        match value {
            Ok((initial, stream)) => Self::ok(initial, stream),
            Err(error) => Self::err(error.into()),
        }
    }
}

// --- JS conversion -----------------------------------------------------
//
// Each wrapper converts to a JS object that the worker dispatcher
// destructures. The shapes mirror what the generic dispatcher and
// `HarmonyClient` expect.

fn rpc_result_to_jsvalue<T: Serialize>(result: Result<T, HarmonyError>) -> JsValue {
    let obj = js_sys::Object::new();
    match result {
        Ok(value) => {
            let _ = js_sys::Reflect::set(&obj, &"ok".into(), &JsValue::TRUE);
            let serialized = serde_wasm_bindgen::to_value(&value).unwrap_or(JsValue::UNDEFINED);
            let _ = js_sys::Reflect::set(&obj, &"value".into(), &serialized);
        }
        Err(error) => {
            let _ = js_sys::Reflect::set(&obj, &"ok".into(), &JsValue::FALSE);
            let serialized = serde_wasm_bindgen::to_value(&error).unwrap_or(JsValue::UNDEFINED);
            let _ = js_sys::Reflect::set(&obj, &"error".into(), &serialized);
        }
    }
    obj.into()
}

impl<T: Serialize> From<Rpc<T>> for JsValue {
    fn from(value: Rpc<T>) -> Self {
        rpc_result_to_jsvalue(value.0)
    }
}

impl From<Command> for JsValue {
    fn from(value: Command) -> Self {
        rpc_result_to_jsvalue(value.0)
    }
}

impl<I: Serialize, C> From<Subscription<I, C>> for JsValue {
    fn from(value: Subscription<I, C>) -> Self {
        let obj = js_sys::Object::new();
        match value.inner {
            Ok(payload) => {
                let _ = js_sys::Reflect::set(&obj, &"ok".into(), &Self::TRUE);
                let initial =
                    serde_wasm_bindgen::to_value(&payload.initial).unwrap_or(Self::UNDEFINED);
                let _ = js_sys::Reflect::set(&obj, &"initial".into(), &initial);
                let _ = js_sys::Reflect::set(&obj, &"stream".into(), &payload.stream);
            }
            Err(error) => {
                let _ = js_sys::Reflect::set(&obj, &"ok".into(), &Self::FALSE);
                let serialized = serde_wasm_bindgen::to_value(&error).unwrap_or(Self::UNDEFINED);
                let _ = js_sys::Reflect::set(&obj, &"error".into(), &serialized);
            }
        }
        obj.into()
    }
}

// --- WasmDescribe ------------------------------------------------------
//
// Required so wasm-bindgen can use these as return types. We describe as
// raw JsValue — the typed TS surface is generated by `harmony codegen` from
// custom-section metadata, not by wasm-bindgen.

impl<T: Serialize> WasmDescribe for Rpc<T> {
    fn describe() {
        JsValue::describe();
    }
}

impl WasmDescribe for Command {
    fn describe() {
        JsValue::describe();
    }
}

impl<I: Serialize, C> WasmDescribe for Subscription<I, C> {
    fn describe() {
        JsValue::describe();
    }
}
