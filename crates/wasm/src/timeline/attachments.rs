use matrix_sdk::ruma::events::room::message::{
    AudioInfo, AudioMessageEventContent, FileInfo, FileMessageEventContent,
    ImageMessageEventContent, MessageType, VideoInfo, VideoMessageEventContent,
};
use matrix_sdk::ruma::events::room::{EncryptedFile, ImageInfo, MediaSource};
use matrix_sdk_ui::timeline::{EventTimelineItem, Message};
use serde::{Deserialize, Serialize};
use tsify::Tsify;

pub const ATTACHMENT_LIMIT_COUNT: usize = 10;

#[derive(Tsify, Serialize, Deserialize)]
#[tsify(into_wasm_abi)]
#[serde(rename_all = "camelCase")]
pub struct Attachment {
    pub body: String,
    pub msgtype: String, // m.video m.image m.file

    #[serde(skip_serializing_if = "Option::is_none")]
    pub filename: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub file: Option<EncryptedFile>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub format: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub formatted_body: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub info: Option<AttachmentInfo>,
}

#[derive(Tsify, Serialize, Deserialize)]
#[tsify(into_wasm_abi)]
#[serde(rename_all = "camelCase", untagged)]
pub enum AttachmentInfo {
    Image(Box<ImageInfo>),
    Video(Box<VideoInfo>),
    Audio(Box<AudioInfo>),
    File(Box<FileInfo>),
}

impl Attachment {
    pub fn from_message(event: &EventTimelineItem, message: &Message) -> Option<Vec<Self>> {
        match message.msgtype() {
            MessageType::Text(_) | MessageType::Notice(_) | MessageType::Emote(_) => {
                Some(Self::from_inline_attachments(event))
            }
            MessageType::File(f) => Some(vec![Self::from_file_event(f)]),
            MessageType::Audio(a) => Some(vec![Self::from_audio_event(a)]),
            MessageType::Video(v) => Some(vec![Self::from_video_event(v)]),
            MessageType::Image(i) => Some(vec![Self::from_image_event(i)]),
            _ => None,
        }
    }

    // MSC3382
    fn from_inline_attachments(event: &EventTimelineItem) -> Vec<Self> {
        let attachments = event
            .original_json()
            .and_then(|json| {
                let content = json.get_field::<serde_json::Value>("content").ok()??;
                serde_json::from_value::<Vec<Self>>(content.get("m.attachments")?.clone()).ok()
            })
            .unwrap_or_default();

        attachments
            .into_iter()
            .take(ATTACHMENT_LIMIT_COUNT)
            .collect()
    }

    fn from_file_event(event: &FileMessageEventContent) -> Self {
        // Per MSC2530: if `filename` field is present, `body` is the caption;
        // otherwise `body` is the filename.
        let (url, file) = match &event.source {
            MediaSource::Plain(uri) => (Some(uri.to_string()), None),
            MediaSource::Encrypted(encrypted) => (None, Some(encrypted.as_ref().clone())),
        };

        Self {
            msgtype: "m.file".to_string(),
            body: event.body.clone(),
            filename: event.filename.clone(),
            url,
            file,
            format: event.formatted.as_ref().map(|f| f.format.to_string()),
            formatted_body: event.formatted.as_ref().map(|f| f.body.clone()),
            info: event
                .info
                .as_ref()
                .map(|info| AttachmentInfo::File(info.clone())),
        }
    }

    fn from_audio_event(event: &AudioMessageEventContent) -> Self {
        let (url, file) = match &event.source {
            MediaSource::Plain(uri) => (Some(uri.to_string()), None),
            MediaSource::Encrypted(encrypted) => (None, Some(encrypted.as_ref().clone())),
        };

        Self {
            msgtype: "m.audio".to_string(),
            body: event.body.clone(),
            filename: event.filename.clone(),
            url,
            file,
            format: event.formatted.as_ref().map(|f| f.format.to_string()),
            formatted_body: event.formatted.as_ref().map(|f| f.body.clone()),
            info: event
                .info
                .as_ref()
                .map(|info| AttachmentInfo::Audio(info.clone())),
        }
    }

    fn from_image_event(event: &ImageMessageEventContent) -> Self {
        let (url, file) = match &event.source {
            MediaSource::Plain(uri) => (Some(uri.to_string()), None),
            MediaSource::Encrypted(encrypted) => (None, Some(encrypted.as_ref().clone())),
        };

        Self {
            msgtype: "m.image".to_string(),
            body: event.body.clone(),
            filename: event.filename.clone(),
            url,
            file,
            format: event.formatted.as_ref().map(|f| f.format.to_string()),
            formatted_body: event.formatted.as_ref().map(|f| f.body.clone()),
            info: event
                .info
                .as_ref()
                .map(|info| AttachmentInfo::Image(info.clone())),
        }
    }

    fn from_video_event(event: &VideoMessageEventContent) -> Self {
        let (url, file) = match &event.source {
            MediaSource::Plain(uri) => (Some(uri.to_string()), None),
            MediaSource::Encrypted(encrypted) => (None, Some(encrypted.as_ref().clone())),
        };

        Self {
            msgtype: "m.video".to_string(),
            body: event.body.clone(),
            filename: event.filename.clone(),
            url,
            file,
            format: event.formatted.as_ref().map(|f| f.format.to_string()),
            formatted_body: event.formatted.as_ref().map(|f| f.body.clone()),
            info: event
                .info
                .as_ref()
                .map(|info| AttachmentInfo::Video(info.clone())),
        }
    }
}
