//! Mobile transport scaffolding for `#[harmony_export]` subscription
//! wrappers.
//!
//! Each wrapper spawns a pump that forwards stream items to a foreign async
//! sink and returns a `TaskHandle` the caller can cancel. Because the sink's
//! `chunk` method is `async`, the pump awaits each delivery — so a slow
//! consumer paces the producer instead of the producer buffering without
//! bound, which is the failure mode the desktop pump still has.

use std::sync::Mutex;

use tokio::task::AbortHandle;

/// Cancel handle for a subscription pump. Dropping it also aborts, so a
/// foreign caller that loses the reference does not leak the task.
#[derive(uniffi::Object)]
pub struct TaskHandle(Mutex<Option<AbortHandle>>);

impl TaskHandle {
    pub fn new(handle: AbortHandle) -> Self {
        Self(Mutex::new(Some(handle)))
    }
}

#[uniffi::export]
impl TaskHandle {
    pub fn cancel(&self) {
        if let Ok(mut guard) = self.0.lock()
            && let Some(handle) = guard.take()
        {
            handle.abort();
        }
    }
}

impl Drop for TaskHandle {
    fn drop(&mut self) {
        self.cancel();
    }
}
