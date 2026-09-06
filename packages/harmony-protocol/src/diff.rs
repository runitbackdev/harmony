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

/// Declare a uniffi identity for one `ListDiff<T>` instantiation. uniffi has
/// no generics, so each concrete chunk type needs a named mirror enum; the
/// `custom_type!` bridge converts between the generic original and it, which
/// is what gets the foreign side a real sealed class rather than a JSON
/// string.
#[cfg(feature = "mobile")]
#[macro_export]
macro_rules! list_diff_uniffi {
    ($alias:ident, $mirror:ident, $t:ty) => {
        pub type $alias = $crate::diff::ListDiff<$t>;

        #[derive(uniffi::Enum)]
        pub enum $mirror {
            Append { values: Vec<$t> },
            Clear,
            PushFront { value: $t },
            PushBack { value: $t },
            PopFront,
            PopBack,
            Insert { index: u32, value: $t },
            Set { index: u32, value: $t },
            Remove { index: u32 },
            Truncate { length: u32 },
            Reset { values: Vec<$t> },
        }

        impl From<$alias> for $mirror {
            fn from(value: $alias) -> Self {
                use $crate::diff::ListDiff as D;
                match value {
                    D::Append { values } => Self::Append { values },
                    D::Clear {} => Self::Clear,
                    D::PushFront { value } => Self::PushFront { value },
                    D::PushBack { value } => Self::PushBack { value },
                    D::PopFront {} => Self::PopFront,
                    D::PopBack {} => Self::PopBack,
                    D::Insert { index, value } => Self::Insert { index, value },
                    D::Set { index, value } => Self::Set { index, value },
                    D::Remove { index } => Self::Remove { index },
                    D::Truncate { length } => Self::Truncate { length },
                    D::Reset { values } => Self::Reset { values },
                }
            }
        }

        impl From<$mirror> for $alias {
            fn from(value: $mirror) -> Self {
                match value {
                    $mirror::Append { values } => Self::Append { values },
                    $mirror::Clear => Self::Clear {},
                    $mirror::PushFront { value } => Self::PushFront { value },
                    $mirror::PushBack { value } => Self::PushBack { value },
                    $mirror::PopFront => Self::PopFront {},
                    $mirror::PopBack => Self::PopBack {},
                    $mirror::Insert { index, value } => Self::Insert { index, value },
                    $mirror::Set { index, value } => Self::Set { index, value },
                    $mirror::Remove { index } => Self::Remove { index },
                    $mirror::Truncate { length } => Self::Truncate { length },
                    $mirror::Reset { values } => Self::Reset { values },
                }
            }
        }

        uniffi::custom_type!($alias, $mirror, {
            remote,
            lower: |value| $mirror::from(value),
            try_lift: |value| Ok($alias::from(value)),
        });
    };
}
