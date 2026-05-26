use jiff::Timestamp;

#[derive(Debug, toasty::Model)]
pub struct CustomStatus {
    #[key]
    #[auto]
    pub id: i64,

    #[unique]
    pub mxid: String,

    pub emoji_name: Option<String>,
    pub emoji_id: Option<String>,

    #[default(false)]
    pub emoji_animated: bool,

    pub text: Option<String>,

    pub expires_at: Option<Timestamp>,

    #[auto]
    pub created_at: Timestamp,

    #[auto]
    pub updated_at: Timestamp,
}
