use std::sync::LazyLock;

use jiff::Timestamp;
use regex::Regex;
use serde::{Deserialize, Serialize};

pub const INVITE_CODE_ALPHABET: [char; 63] = [
    '-', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h',
    'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', 'A',
    'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T',
    'U', 'V', 'W', 'X', 'Y', 'Z',
];

static INVITE_CODE_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^[a-zA-Z0-9\-]{3,32}$").expect("invite code regex"));

pub fn is_valid_invite_code(code: &str) -> bool {
    INVITE_CODE_RE.is_match(code)
}

#[derive(Debug, Serialize, toasty::Model)]
#[serde(rename_all = "camelCase")]
pub struct InviteLink {
    #[key]
    #[auto]
    pub id: i64,

    #[unique]
    pub code: String,

    pub space_mxid: String,
    pub creator_mxid: String,
    pub max_uses: Option<i64>,

    #[default(0_i64)]
    pub use_count: i64,

    pub expires_at: Option<Timestamp>,

    #[auto]
    pub created_at: Timestamp,

    #[auto]
    pub updated_at: Timestamp,
}

impl InviteLink {
    pub fn is_expired(&self) -> bool {
        self.expires_at.is_some_and(|ts| ts < Timestamp::now())
    }

    pub fn is_maxed_out(&self) -> bool {
        self.max_uses.is_some_and(|max| self.use_count >= max)
    }

    pub fn is_active(&self) -> bool {
        !self.is_expired() && !self.is_maxed_out()
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateInvite {
    pub space_mxid: String,
    pub code: Option<String>,
    pub max_uses: Option<i64>,
    pub expires_at: Option<Timestamp>,
}
