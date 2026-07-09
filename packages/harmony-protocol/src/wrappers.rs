use std::pin::Pin;

use futures_util::Stream;
use matrix_sdk_common::SendOutsideWasm;
use serde::de::{self, MapAccess, Visitor};
use serde::ser::SerializeStruct;
use serde::{Deserialize, Deserializer, Serialize, Serializer};

use crate::error::HarmonyError;

/// Request/response bridge call. Serialized as
/// `{ ok: true, value: T } | { ok: false, error: HarmonyError }`.
#[must_use]
pub struct Rpc<T>(pub Result<T, HarmonyError>);

impl<T> Rpc<T> {
    pub const fn ok(value: T) -> Self {
        Self(Ok(value))
    }

    pub const fn err(error: HarmonyError) -> Self {
        Self(Err(error))
    }
}

impl<T, E> From<Result<T, E>> for Rpc<T>
where
    E: Into<HarmonyError>,
{
    fn from(value: Result<T, E>) -> Self {
        Self(value.map_err(Into::into))
    }
}

impl<T: Serialize> Serialize for Rpc<T> {
    fn serialize<S: Serializer>(&self, ser: S) -> Result<S::Ok, S::Error> {
        let mut s = ser.serialize_struct("Rpc", 2)?;
        match &self.0 {
            Ok(value) => {
                s.serialize_field("ok", &true)?;
                s.serialize_field("value", value)?;
            }
            Err(error) => {
                s.serialize_field("ok", &false)?;
                s.serialize_field("error", error)?;
            }
        }
        s.end()
    }
}

impl<'de, T: Deserialize<'de>> Deserialize<'de> for Rpc<T> {
    fn deserialize<D: Deserializer<'de>>(de: D) -> Result<Self, D::Error> {
        de.deserialize_map(RpcVisitor::<T>(std::marker::PhantomData))
    }
}

struct RpcVisitor<T>(std::marker::PhantomData<T>);

impl<'de, T: Deserialize<'de>> Visitor<'de> for RpcVisitor<T> {
    type Value = Rpc<T>;

    fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        f.write_str("Rpc { ok, value | error }")
    }

    fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<Rpc<T>, A::Error> {
        let mut ok: Option<bool> = None;
        let mut value: Option<T> = None;
        let mut error: Option<HarmonyError> = None;
        while let Some(key) = map.next_key::<String>()? {
            match key.as_str() {
                "ok" => ok = Some(map.next_value()?),
                "value" => value = Some(map.next_value()?),
                "error" => error = Some(map.next_value()?),
                _ => {
                    let _ = map.next_value::<serde::de::IgnoredAny>()?;
                }
            }
        }
        match ok {
            Some(true) => Ok(Rpc(Ok(
                value.ok_or_else(|| de::Error::missing_field("value"))?
            ))),
            Some(false) => Ok(Rpc(Err(
                error.ok_or_else(|| de::Error::missing_field("error"))?
            ))),
            None => Err(de::Error::missing_field("ok")),
        }
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

impl Serialize for Command {
    fn serialize<S: Serializer>(&self, ser: S) -> Result<S::Ok, S::Error> {
        let mut s = ser.serialize_struct("Command", 2)?;
        match &self.0 {
            Ok(()) => {
                s.serialize_field("ok", &true)?;
            }
            Err(error) => {
                s.serialize_field("ok", &false)?;
                s.serialize_field("error", error)?;
            }
        }
        s.end()
    }
}

impl<'de> Deserialize<'de> for Command {
    fn deserialize<D: Deserializer<'de>>(de: D) -> Result<Self, D::Error> {
        de.deserialize_map(CommandVisitor)
    }
}

struct CommandVisitor;

impl<'de> Visitor<'de> for CommandVisitor {
    type Value = Command;

    fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        f.write_str("Command { ok, error? }")
    }

    fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<Command, A::Error> {
        let mut ok: Option<bool> = None;
        let mut error: Option<HarmonyError> = None;
        while let Some(key) = map.next_key::<String>()? {
            match key.as_str() {
                "ok" => ok = Some(map.next_value()?),
                "error" => error = Some(map.next_value()?),
                _ => {
                    let _ = map.next_value::<serde::de::IgnoredAny>()?;
                }
            }
        }
        match ok {
            Some(true) => Ok(Command(Ok(()))),
            Some(false) => Ok(Command(Err(
                error.ok_or_else(|| de::Error::missing_field("error"))?
            ))),
            None => Err(de::Error::missing_field("ok")),
        }
    }
}

/// Stream trait alias combining `Stream<Item = T>` with `SendOutsideWasm`.
/// `Send` cannot appear directly as a trait-object bound alongside `Stream`
/// (only auto traits can), so we glue them together behind one trait that
/// auto-impls for any matching stream.
pub trait HarmonyStream<T>: Stream<Item = T> + SendOutsideWasm {}

impl<T, S> HarmonyStream<T> for S where S: Stream<Item = T> + SendOutsideWasm {}

/// Type alias for the boxed, pinned stream half of a `Subscription`.
pub type SubscriptionStream<C> = Pin<Box<dyn HarmonyStream<C>>>;

/// Subscription bridge call.
///
/// Carries either a successful startup (initial snapshot + stream of
/// chunks) or a startup error. The stream is portable; the
/// `#[harmony_export(kind = "subscription")]` macro wraps it into the
/// transport-specific surface (e.g. `web_sys::ReadableStream`) at the
/// binding boundary.
#[must_use]
pub struct Subscription<I, C> {
    inner: Result<SubscriptionOk<I, C>, HarmonyError>,
}

struct SubscriptionOk<I, C> {
    initial: I,
    stream: SubscriptionStream<C>,
}

impl<I, C> Subscription<I, C> {
    pub fn ok<S>(initial: I, stream: S) -> Self
    where
        S: Stream<Item = C> + SendOutsideWasm + 'static,
    {
        Self {
            inner: Ok(SubscriptionOk {
                initial,
                stream: Box::pin(stream),
            }),
        }
    }

    pub const fn err(error: HarmonyError) -> Self {
        Self { inner: Err(error) }
    }

    pub fn into_parts(self) -> Result<(I, SubscriptionStream<C>), HarmonyError> {
        self.inner.map(|payload| (payload.initial, payload.stream))
    }
}

impl<I, C, E, S> From<Result<(I, S), E>> for Subscription<I, C>
where
    E: Into<HarmonyError>,
    S: Stream<Item = C> + SendOutsideWasm + 'static,
{
    fn from(value: Result<(I, S), E>) -> Self {
        match value {
            Ok((initial, stream)) => Self::ok(initial, stream),
            Err(error) => Self::err(error.into()),
        }
    }
}

/// Hand the TypeScript exporter a literal type string.
///
/// specta has no native `Uint8Array`/`unknown`, so wire-opaque wrappers name
/// their TS shape directly. Affects only the generated `.d.ts`; the bytes
/// cross the bridge per each type's serde impl.
fn opaque_ts(ts: &'static str) -> specta::datatype::DataType {
    specta::datatype::DataType::Reference(specta_typescript::define(ts))
}

/// Wire-opaque passthrough for foreign types that don't implement
/// `specta::Type` (e.g. ruma types).
///
/// Serializes transparently as its inner value, so the data crosses the bridge
/// intact, but exposes no structure to the type generator. Use when a value
/// must survive the round-trip but the frontend treats it as a blob — avoids
/// mirroring the full foreign shape.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(transparent)]
pub struct Opaque<T>(pub T);

impl<T> specta::Type for Opaque<T> {
    // `unknown`, not a unit struct: the value is a real object the frontend
    // passes back verbatim, so a unit (which renders as `null`) would lie.
    fn definition(_types: &mut specta::Types) -> specta::datatype::DataType {
        opaque_ts("unknown")
    }
}

/// Raw bytes that cross the serde/wasm boundary as a `Uint8Array`.
///
/// `serde_bytes` drives serde's `serialize_bytes` / `deserialize_bytes`, which
/// serde-wasm-bindgen reads straight off a typed array instead of boxing each
/// byte into a `number[]`. The TS type is `Uint8Array<ArrayBuffer>` — the
/// non-shared buffer the DOM's `BufferSource` (e.g. `Blob`) requires, so
/// consumers pass it straight through without a cast.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(transparent)]
pub struct Bytes(#[serde(with = "serde_bytes")] pub Vec<u8>);

impl specta::Type for Bytes {
    fn definition(_types: &mut specta::Types) -> specta::datatype::DataType {
        opaque_ts("Uint8Array<ArrayBuffer>")
    }
}

// --- wasm-bindgen ABI -----------------------------------------------------
//
// Cfg-gated impls that route through `serde-wasm-bindgen` for `Rpc<T>` /
// `Command` and through `wasm_streams::from_stream` for `Subscription`.
// The shapes mirror the manual `Serialize` impls above so the worker sees
// `{ ok, value | error }`, `{ ok, error? }`, and `{ ok, initial, stream | error }`.

#[cfg(feature = "web")]
mod wasm_abi {
    use futures_util::StreamExt;
    use wasm_bindgen::JsValue;
    use wasm_bindgen::convert::IntoWasmAbi;
    use wasm_bindgen::describe::WasmDescribe;

    use super::{Command, Rpc, Subscription};

    impl<T: ::serde::Serialize> From<Rpc<T>> for JsValue {
        fn from(value: Rpc<T>) -> Self {
            ::serde_wasm_bindgen::to_value(&value).unwrap_or(Self::UNDEFINED)
        }
    }

    impl From<Command> for JsValue {
        fn from(value: Command) -> Self {
            ::serde_wasm_bindgen::to_value(&value).unwrap_or(Self::UNDEFINED)
        }
    }

    impl<I: ::serde::Serialize, C: ::serde::Serialize + 'static> From<Subscription<I, C>> for JsValue {
        fn from(value: Subscription<I, C>) -> Self {
            let obj = ::js_sys::Object::new();
            match value.inner {
                Ok(payload) => {
                    let _ = ::js_sys::Reflect::set(&obj, &"ok".into(), &Self::TRUE);
                    let initial =
                        ::serde_wasm_bindgen::to_value(&payload.initial).unwrap_or(Self::UNDEFINED);
                    let _ = ::js_sys::Reflect::set(&obj, &"initial".into(), &initial);

                    let mapped = payload.stream.map(|chunk| {
                        ::serde_wasm_bindgen::to_value(&chunk)
                            .map_err(|e| Self::from_str(&e.to_string()))
                    });
                    let readable = ::wasm_streams::ReadableStream::from_stream(mapped).into_raw();
                    let _ = ::js_sys::Reflect::set(&obj, &"stream".into(), &readable);
                }
                Err(error) => {
                    let _ = ::js_sys::Reflect::set(&obj, &"ok".into(), &Self::FALSE);
                    let serialized =
                        ::serde_wasm_bindgen::to_value(&error).unwrap_or(Self::UNDEFINED);
                    let _ = ::js_sys::Reflect::set(&obj, &"error".into(), &serialized);
                }
            }
            Self::from(obj)
        }
    }

    impl<T: ::serde::Serialize> WasmDescribe for Rpc<T> {
        fn describe() {
            JsValue::describe();
        }
    }

    impl<T: ::serde::Serialize> IntoWasmAbi for Rpc<T> {
        type Abi = <JsValue as IntoWasmAbi>::Abi;
        fn into_abi(self) -> Self::Abi {
            ::serde_wasm_bindgen::to_value(&self)
                .unwrap_or(JsValue::UNDEFINED)
                .into_abi()
        }
    }

    impl WasmDescribe for Command {
        fn describe() {
            JsValue::describe();
        }
    }

    impl IntoWasmAbi for Command {
        type Abi = <JsValue as IntoWasmAbi>::Abi;
        fn into_abi(self) -> Self::Abi {
            ::serde_wasm_bindgen::to_value(&self)
                .unwrap_or(JsValue::UNDEFINED)
                .into_abi()
        }
    }

    impl<I: ::serde::Serialize, C: ::serde::Serialize + 'static> WasmDescribe for Subscription<I, C> {
        fn describe() {
            JsValue::describe();
        }
    }

    impl<I: ::serde::Serialize, C: ::serde::Serialize + 'static> IntoWasmAbi for Subscription<I, C> {
        type Abi = <JsValue as IntoWasmAbi>::Abi;
        fn into_abi(self) -> Self::Abi {
            JsValue::from(self).into_abi()
        }
    }
}
