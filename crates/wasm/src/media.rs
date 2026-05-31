use harmony_protocol::{Rpc, harmony_export};
use mime::Mime;
use serde::{Deserialize, Serialize};
use tsify::Tsify;

use crate::{client, errors::HarmonyError};

#[derive(Tsify, Deserialize)]
#[tsify(from_wasm_abi)]
#[serde(rename_all = "camelCase")]
pub struct MediaUploadInput {
    pub data: Vec<u8>,
    pub content_type: Option<String>,
}

#[derive(Tsify, Serialize)]
#[tsify(into_wasm_abi)]
#[serde(rename_all = "camelCase")]
pub struct MediaUploaded {
    pub mx_url: String,
}

#[harmony_export(domain = "media", action = "upload")]
pub async fn upload(input: MediaUploadInput) -> Rpc<MediaUploaded> {
    upload_media_impl(input.data, input.content_type)
        .await
        .map(|mx_url| MediaUploaded { mx_url })
        .into()
}

pub async fn upload_media_impl(
    data: Vec<u8>,
    content_type: Option<String>,
) -> Result<String, HarmonyError> {
    let client = client::get().ok_or(HarmonyError::ClientNotReady)?;
    let mime_type: Mime = content_type.map_or_else(
        || Ok(mime::APPLICATION_OCTET_STREAM),
        |c| c.parse().map_err(|_| HarmonyError::MimeTypeError),
    )?;

    let response = client.media().upload(&mime_type, data, None).await?;

    Ok(response.content_uri.to_string())
}
