use std::cell::RefCell;

use matrix_sdk::Client;

use crate::errors::HarmonyError;

thread_local! {
    static CLIENT: RefCell<Option<Client>> = const { RefCell::new(None) };
}

pub fn set(client: Client) -> Result<(), HarmonyError> {
    CLIENT.with(|inner| {
        let mut borrowed = inner.borrow_mut();

        if borrowed.is_some() {
            return Err(HarmonyError::ClientAlreadyInitialized);
        }

        *borrowed = Some(client);

        Ok(())
    })
}

pub fn clear() {
    CLIENT.set(None);
}

#[allow(unused)]
pub fn get() -> Option<Client> {
    CLIENT.with(|inner| inner.borrow().clone())
}
