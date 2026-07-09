use std::sync::OnceLock;

#[cfg(not(target_arch = "wasm32"))]
use std::sync::{Mutex, PoisonError};

/// Cross-target shared cell. Same surface on wasm and native.
///
/// On `wasm32`: `OnceLock<WasmCell<T>>` where `WasmCell` is
/// a `RefCell<T>` with an `unsafe impl Sync`. Wasm executes on a single
/// thread per JS realm, so cross-thread observation is impossible and the
/// `Sync` requirement on `static` is vacuously safe to satisfy.
///
/// On native: `OnceLock<Mutex<T>>`. Standard cross-thread storage.
pub struct Shared<T: 'static> {
    #[cfg(target_arch = "wasm32")]
    inner: OnceLock<WasmCell<T>>,
    #[cfg(not(target_arch = "wasm32"))]
    inner: OnceLock<Mutex<T>>,
}

#[cfg(target_arch = "wasm32")]
struct WasmCell<T>(std::cell::RefCell<T>);

// SAFETY: `wasm32-unknown-unknown` executes on a single thread per JS realm.
// There is no thread that could observe a mid-mutation `RefCell` nor any
// thread to transfer ownership to. We promise `Send` + `Sync` solely so the
// value can live in a `static` and inside `OnceLock` (which requires
// `T: Send + Sync` to itself be `Sync`).
#[cfg(target_arch = "wasm32")]
#[allow(unsafe_code)]
unsafe impl<T> Sync for WasmCell<T> {}

#[cfg(target_arch = "wasm32")]
#[allow(unsafe_code)]
unsafe impl<T> Send for WasmCell<T> {}

impl<T: Default + 'static> Shared<T> {
    pub const fn new() -> Self {
        Self {
            inner: OnceLock::new(),
        }
    }

    pub fn with<R>(&self, f: impl FnOnce(&mut T) -> R) -> R {
        #[cfg(target_arch = "wasm32")]
        {
            let cell = self
                .inner
                .get_or_init(|| WasmCell(std::cell::RefCell::new(T::default())));
            f(&mut cell.0.borrow_mut())
        }
        #[cfg(not(target_arch = "wasm32"))]
        {
            let mutex = self.inner.get_or_init(|| Mutex::new(T::default()));
            let mut guard = mutex.lock().unwrap_or_else(PoisonError::into_inner);
            f(&mut guard)
        }
    }
}

impl<T: Default + 'static> Default for Shared<T> {
    fn default() -> Self {
        Self::new()
    }
}
