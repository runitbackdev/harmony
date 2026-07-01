use matrix_sdk::ruma::UInt;
use matrix_sdk::ruma::events::room::message::{
    AudioMessageEventContent, FileMessageEventContent, ImageMessageEventContent, MessageType,
    VideoMessageEventContent,
};
use matrix_sdk::ruma::events::room::{EncryptedFile, MediaSource};
use matrix_sdk_ui::timeline::{EventTimelineItem, Message};

use crate::{Opaque, harmony};

pub const ATTACHMENT_LIMIT_COUNT: usize = 10;

#[harmony]
pub struct Attachment {
    pub body: String,
    pub msgtype: String, // m.video m.image m.file

    pub filename: Option<String>,

    pub url: Option<String>,

    pub file: Option<Opaque<EncryptedFile>>,

    pub format: Option<String>,

    pub formatted_body: Option<String>,

    pub info: Option<AttachmentInfo>,
}

/// Flattened media metadata. Mirrors the fields the client reads across every
/// `m.*` attachment kind; ruma's per-type info structs aren't carried on the
/// wire (they don't implement `specta::Type`).
#[harmony]
pub struct AttachmentInfo {
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub duration_ms: Option<u32>,
    pub size: Option<u32>,
    pub mimetype: Option<String>,
}

/// Matrix canonical JSON forbids floats, and specta forbids exporting 64-bit
/// ints to TypeScript — so attachment metadata rides the wire as `u32`. Values
/// exceeding `u32` (e.g. a >4 GiB upload) are dropped rather than truncated.
fn num(value: Option<UInt>) -> Option<u32> {
    value.and_then(|n| u32::try_from(u64::from(n)).ok())
}

fn split_source(source: &MediaSource) -> (Option<String>, Option<Opaque<EncryptedFile>>) {
    match source {
        MediaSource::Plain(uri) => (Some(uri.to_string()), None),
        MediaSource::Encrypted(encrypted) => (None, Some(Opaque(encrypted.as_ref().clone()))),
    }
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
        let (url, file) = split_source(&event.source);

        Self {
            msgtype: "m.file".to_string(),
            body: event.body.clone(),
            filename: event.filename.clone(),
            url,
            file,
            format: event.formatted.as_ref().map(|f| f.format.to_string()),
            formatted_body: event.formatted.as_ref().map(|f| f.body.clone()),
            info: event.info.as_ref().map(|info| AttachmentInfo {
                width: None,
                height: None,
                duration_ms: None,
                size: num(info.size),
                mimetype: info.mimetype.clone(),
            }),
        }
    }

    fn from_audio_event(event: &AudioMessageEventContent) -> Self {
        let (url, file) = split_source(&event.source);

        Self {
            msgtype: "m.audio".to_string(),
            body: event.body.clone(),
            filename: event.filename.clone(),
            url,
            file,
            format: event.formatted.as_ref().map(|f| f.format.to_string()),
            formatted_body: event.formatted.as_ref().map(|f| f.body.clone()),
            info: event.info.as_ref().map(|info| AttachmentInfo {
                width: None,
                height: None,
                duration_ms: info
                    .duration
                    .and_then(|d| u32::try_from(d.as_millis()).ok()),
                size: num(info.size),
                mimetype: info.mimetype.clone(),
            }),
        }
    }

    fn from_image_event(event: &ImageMessageEventContent) -> Self {
        let (url, file) = split_source(&event.source);

        Self {
            msgtype: "m.image".to_string(),
            body: event.body.clone(),
            filename: event.filename.clone(),
            url,
            file,
            format: event.formatted.as_ref().map(|f| f.format.to_string()),
            formatted_body: event.formatted.as_ref().map(|f| f.body.clone()),
            info: event.info.as_ref().map(|info| AttachmentInfo {
                width: num(info.width),
                height: num(info.height),
                duration_ms: None,
                size: num(info.size),
                mimetype: info.mimetype.clone(),
            }),
        }
    }

    fn from_video_event(event: &VideoMessageEventContent) -> Self {
        let (url, file) = split_source(&event.source);

        Self {
            msgtype: "m.video".to_string(),
            body: event.body.clone(),
            filename: event.filename.clone(),
            url,
            file,
            format: event.formatted.as_ref().map(|f| f.format.to_string()),
            formatted_body: event.formatted.as_ref().map(|f| f.body.clone()),
            info: event.info.as_ref().map(|info| AttachmentInfo {
                width: num(info.width),
                height: num(info.height),
                duration_ms: info
                    .duration
                    .and_then(|d| u32::try_from(d.as_millis()).ok()),
                size: num(info.size),
                mimetype: info.mimetype.clone(),
            }),
        }
    }
}
