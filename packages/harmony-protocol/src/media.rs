use matrix_sdk::media::{MediaFormat, MediaRequestParameters};
use matrix_sdk::ruma::events::room::{EncryptedFile, MediaSource};
use mime::Mime;

use crate::{Bytes, Opaque, Rpc, client, harmony, harmony_export, internal_error::InternalError};

#[harmony]
pub struct MediaUploadInput {
    pub data: Bytes,
    pub content_type: Option<String>,
}

#[harmony]
pub struct MediaUploaded {
    pub mx_url: String,
}

#[harmony_export(domain = "media", action = "upload", bytes_in = "data")]
pub async fn upload(input: MediaUploadInput) -> Rpc<MediaUploaded> {
    upload_impl(input.data.0, input.content_type)
        .await
        .map(|mx_url| MediaUploaded { mx_url })
        .into()
}

async fn upload_impl(data: Vec<u8>, content_type: Option<String>) -> Result<String, InternalError> {
    let client = client::get().ok_or(InternalError::ClientNotReady)?;
    let mime_type: Mime = content_type.map_or_else(
        || Ok(mime::APPLICATION_OCTET_STREAM),
        |c| c.parse().map_err(|_| InternalError::MimeTypeError),
    )?;

    let response = client.media().upload(&mime_type, data, None).await?;

    Ok(response.content_uri.to_string())
}

#[harmony]
pub struct MediaFetchInput {
    pub file: Opaque<EncryptedFile>,
    pub content_type: Option<String>,
}

#[harmony]
pub struct MediaContent {
    pub bytes: Bytes,
    pub content_type: String,
}

#[harmony_export(domain = "media", action = "fetch", bytes_out = "bytes")]
pub async fn fetch(input: MediaFetchInput) -> Rpc<MediaContent> {
    fetch_impl(input.file.0, input.content_type).await.into()
}

async fn fetch_impl(
    file: EncryptedFile,
    content_type: Option<String>,
) -> Result<MediaContent, InternalError> {
    let client = client::get().ok_or(InternalError::ClientNotReady)?;
    let request = MediaRequestParameters {
        source: MediaSource::Encrypted(Box::new(file)),
        format: MediaFormat::File,
    };

    let bytes = client.media().get_media_content(&request, true).await?;

    Ok(MediaContent {
        bytes: Bytes(bytes),
        content_type: content_type.unwrap_or_else(|| "application/octet-stream".to_string()),
    })
}
