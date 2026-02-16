use matrix_sdk::ClientBuildError;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum HarmonyError {
    #[error("Authentication failed. Please try again.")]
    AuthFailed,

    #[error("Client already initialized")]
    ClientAlreadyInitialized,

    #[error("{0}")]
    ClientBuildError(#[from] ClientBuildError),

    #[error("{0}")]
    MatrixError(#[from] matrix_sdk::Error),
}
