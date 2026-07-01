use matrix_sdk_ui::eyeball_im::VectorDiff;
use serde::{Deserialize, Serialize};
use specta::Type;

/// Wire-shape diff for `Vec<T>`-style subscriptions. Mirrors the variants
/// of `matrix_sdk_ui::eyeball_im::VectorDiff` so the worker can forward
/// shape-by-shape without re-encoding.
///
/// Carries `#[derive]`s manually rather than going through `#[harmony]`
/// because `ListDiff<T>` is generic; the wasm-bindgen ABI is realised by
/// each concrete chunk type at the `Subscription<I, ListDiff<T>>` boundary,
/// not by `ListDiff` itself.
#[derive(Serialize, Deserialize, Type, Debug, Clone)]
#[serde(tag = "op", rename_all = "snake_case")]
pub enum ListDiff<T> {
    Append { values: Vec<T> },
    Clear {},
    PushFront { value: T },
    PushBack { value: T },
    PopFront {},
    PopBack {},
    Insert { index: u32, value: T },
    Set { index: u32, value: T },
    Remove { index: u32 },
    Truncate { length: u32 },
    Reset { values: Vec<T> },
}

pub fn convert_diffs<T, U>(
    diffs: Vec<VectorDiff<T>>,
    convert: impl Fn(&T) -> U,
) -> Vec<ListDiff<U>> {
    diffs
        .into_iter()
        .map(|diff| match diff {
            VectorDiff::Append { values } => ListDiff::Append {
                values: values.into_iter().map(&convert).collect(),
            },
            VectorDiff::Clear => ListDiff::Clear {},
            VectorDiff::PushFront { value } => ListDiff::PushFront {
                value: convert(&value),
            },
            VectorDiff::PushBack { value } => ListDiff::PushBack {
                value: convert(&value),
            },
            VectorDiff::PopFront => ListDiff::PopFront {},
            VectorDiff::PopBack => ListDiff::PopBack {},
            VectorDiff::Insert { index, value } => ListDiff::Insert {
                index: index as u32,
                value: convert(&value),
            },
            VectorDiff::Set { index, value } => ListDiff::Set {
                index: index as u32,
                value: convert(&value),
            },
            VectorDiff::Remove { index } => ListDiff::Remove {
                index: index as u32,
            },
            VectorDiff::Truncate { length } => ListDiff::Truncate {
                length: length as u32,
            },
            VectorDiff::Reset { values } => ListDiff::Reset {
                values: values.into_iter().map(&convert).collect(),
            },
        })
        .collect()
}
