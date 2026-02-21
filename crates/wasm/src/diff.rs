#![allow(unused)]
use matrix_sdk_ui::eyeball_im::VectorDiff;
use serde::Serialize;
use wasm_bindgen::JsValue;

#[derive(Serialize)]
#[serde(tag = "op", rename_all = "snake_case")]
pub enum ListDiff<T> {
    Append { values: Vec<T> },
    Clear {},
    PushFront { value: T },
    PushBack { value: T },
    PopFront {},
    PopBack {},
    Insert { index: usize, value: T },
    Set { index: usize, value: T },
    Remove { index: usize },
    Truncate { length: usize },
    Reset { values: Vec<T> },
}

pub fn convert_diffs<T, U: Serialize>(
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
                index,
                value: convert(&value),
            },
            VectorDiff::Set { index, value } => ListDiff::Set {
                index,
                value: convert(&value),
            },
            VectorDiff::Remove { index } => ListDiff::Remove { index },
            VectorDiff::Truncate { length } => ListDiff::Truncate { length },
            VectorDiff::Reset { values } => ListDiff::Reset {
                values: values.into_iter().map(&convert).collect(),
            },
        })
        .collect()
}

pub fn serialize_diffs<T, U: Serialize>(
    diffs: Vec<VectorDiff<T>>,
    convert: impl Fn(&T) -> U,
) -> Result<JsValue, JsValue> {
    let list_diffs = convert_diffs(diffs, convert);
    serde_wasm_bindgen::to_value(&list_diffs).map_err(|e| JsValue::from_str(&e.to_string()))
}
