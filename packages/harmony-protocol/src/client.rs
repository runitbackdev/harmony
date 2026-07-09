use matrix_sdk::Client;

use crate::{Shared, internal_error::InternalError};

static CLIENT: Shared<Option<Client>> = Shared::new();

pub fn set(value: Client) -> Result<(), InternalError> {
    CLIENT.with(|opt| {
        if opt.is_some() {
            return Err(InternalError::ClientAlreadyInitialized);
        }
        *opt = Some(value);
        Ok(())
    })
}

pub fn clear() {
    CLIENT.with(|opt| *opt = None);
}

pub fn get() -> Option<Client> {
    CLIENT.with(|opt| opt.clone())
}
