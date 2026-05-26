use crate::auth::power_levels::ensure_can_invite;
use crate::matrix::{Identity, MatrixClient};
use crate::models::invite::{is_valid_invite_code, CreateInvite, InviteLink, INVITE_CODE_ALPHABET};
use crate::state::AppState;
use axum::{
    extract::{Path, State},
    http::StatusCode,
    Extension, Json,
};
use futures_util::stream::{self, StreamExt};
use nanoid::nanoid;
use ruma::events::space::child::HierarchySpaceChildEvent;
use ruma::{uint, OwnedRoomId, RoomId, UserId};
use serde::Serialize;

const CHILD_JOIN_CONCURRENCY: usize = 8;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InviteShowResponse {
    #[serde(flatten)]
    invite: InviteLink,
    name: Option<String>,
    member_count: Option<u64>,
}

pub async fn show(
    Path(code): Path<String>,
    State(state): State<AppState>,
) -> Result<Json<InviteShowResponse>, StatusCode> {
    let mut db = state.db;
    let invite = InviteLink::get_by_code(&mut db, &code)
        .await
        .map_err(|_| StatusCode::NOT_FOUND)?;

    if !invite.is_active() {
        return Err(StatusCode::NOT_FOUND);
    }

    let preview = if let (Ok(space), Ok(creator)) = (
        RoomId::parse(&invite.space_mxid),
        UserId::parse(&invite.creator_mxid),
    ) {
        state
            .matrix
            .space_preview(&space, &creator)
            .await
            .inspect_err(|e| tracing::warn!(error = %e, code = %code, "space_preview failed"))
            .ok()
    } else {
        tracing::error!(code = %code, "invalid mxid stored on invite");
        None
    };

    let (name, member_count) = match preview {
        Some(p) => (Some(p.name), Some(p.member_count)),
        None => (None, None),
    };

    Ok(Json(InviteShowResponse {
        invite,
        name,
        member_count,
    }))
}

pub async fn create(
    State(state): State<AppState>,
    Extension(creator): Extension<Identity>,
    Json(payload): Json<CreateInvite>,
) -> Result<(StatusCode, Json<InviteLink>), StatusCode> {
    let space_id = RoomId::parse(&payload.space_mxid).map_err(|_| StatusCode::BAD_REQUEST)?;
    ensure_can_invite(&state.matrix, &space_id, &creator.user_id).await?;

    let code = match payload.code {
        Some(code) if !is_valid_invite_code(&code) => {
            return Err(StatusCode::UNPROCESSABLE_ENTITY);
        }
        Some(code) => code,
        None => nanoid!(8, &INVITE_CODE_ALPHABET),
    };

    let mut db = state.db;

    let creator_mxid = creator.user_id.to_string();

    let invite = toasty::create!(InviteLink {
        code,
        space_mxid: payload.space_mxid,
        creator_mxid,
        max_uses: payload.max_uses,
        expires_at: payload.expires_at,
    })
    .exec(&mut db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to create invite: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok((StatusCode::CREATED, Json(invite)))
}

pub async fn destroy(
    Path(code): Path<String>,
    State(state): State<AppState>,
    Extension(actor): Extension<Identity>,
) -> Result<StatusCode, StatusCode> {
    let mut db = state.db;
    let invite = InviteLink::get_by_code(&mut db, &code)
        .await
        .map_err(|_| StatusCode::NOT_FOUND)?;

    if actor.user_id.as_str() != invite.creator_mxid {
        let space_id =
            RoomId::parse(&invite.space_mxid).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        ensure_can_invite(&state.matrix, &space_id, &actor.user_id).await?;
    }

    invite
        .delete()
        .exec(&mut db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(StatusCode::NO_CONTENT)
}

pub async fn redeem(
    Path(code): Path<String>,
    State(state): State<AppState>,
    Extension(redeemer): Extension<Identity>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let mut db = state.db;
    let mut invite = InviteLink::get_by_code(&mut db, &code)
        .await
        .map_err(|_| StatusCode::NOT_FOUND)?;

    if invite.is_expired() {
        return Err(StatusCode::GONE);
    }
    if invite.is_maxed_out() {
        return Err(StatusCode::FORBIDDEN);
    }

    let space_id = RoomId::parse(&invite.space_mxid).map_err(|e| {
        tracing::error!(space_mxid = %invite.space_mxid, error = %e, "invalid space_mxid stored on invite");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    let creator_id = UserId::parse(&invite.creator_mxid).map_err(|e| {
        tracing::error!(creator_mxid = %invite.creator_mxid, error = %e, "invalid creator_mxid stored on invite");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    state
        .matrix
        .invite_to_space(&space_id, &redeemer.user_id, &creator_id)
        .await
        .map_err(|e| {
            tracing::error!(error = %e, "invite_to_space failed");
            StatusCode::BAD_GATEWAY
        })?;

    state
        .matrix
        .join_room(&space_id, &redeemer.user_id)
        .await
        .map_err(|e| {
            tracing::error!(error = %e, "join_room(space) failed");
            StatusCode::BAD_GATEWAY
        })?;

    let next_count = invite.use_count + 1;
    invite
        .update()
        .use_count(next_count)
        .exec(&mut db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    fan_out_suggested_children(&state.matrix, &space_id, &redeemer.user_id).await;

    Ok(Json(serde_json::json!({ "spaceMxid": invite.space_mxid })))
}

/// Best-effort fan-out: join the redeemer to every direct child of the
/// space that's marked `suggested: true`. Failures are logged and
/// swallowed — partial success is still a successful redeem.
async fn fan_out_suggested_children(matrix: &MatrixClient, space_id: &RoomId, user: &UserId) {
    let chunks = match matrix
        .space_hierarchy(space_id, user, Some(uint!(1)), true)
        .await
    {
        Ok(c) => c,
        Err(e) => {
            tracing::warn!(error = %e, space = %space_id, "space_hierarchy failed; skipping child fan-out");
            return;
        }
    };

    let Some(root) = chunks.iter().find(|c| c.summary.room_id == *space_id) else {
        tracing::warn!(space = %space_id, "hierarchy response missing root space chunk");
        return;
    };

    let suggested: Vec<OwnedRoomId> = root
        .children_state
        .iter()
        .filter_map(|raw| raw.deserialize().ok())
        .filter(|ev: &HierarchySpaceChildEvent| !ev.content.via.is_empty())
        .map(|ev| ev.state_key)
        .collect();

    stream::iter(suggested)
        .for_each_concurrent(CHILD_JOIN_CONCURRENCY, |child_id| {
            let matrix = matrix.clone();
            let user = user.to_owned();
            async move {
                if let Err(e) = matrix.join_room(&child_id, &user).await {
                    tracing::warn!(error = %e, child = %child_id, user = %user, "auto-join child failed");
                }
            }
        })
        .await;
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::auth::TokenCache;
    use crate::config::Config;
    use crate::matrix::{MatrixApi, MatrixClient, TransactionCache};
    use crate::membership::MembershipCache;
    use crate::models::invite::InviteLink;
    use crate::presence::fanout::PresenceFanout;
    use crate::presence::registry::PresenceRegistry;
    use crate::presence::subscriptions::SubscriptionRegistry;
    use crate::state::AppState;
    use axum::extract::{Path, State};
    use axum::Extension;
    use ruma::OwnedUserId;
    use std::sync::Arc;
    use std::time::Duration;
    use toasty::Db;
    use tokio_util::sync::CancellationToken;
    use url::Url;
    use wiremock::matchers::{method, path, path_regex, query_param};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    const SPACE_ID: &str = "!space:test.org";
    const CREATOR_ID: &str = "@creator:test.org";
    const REDEEMER_ID: &str = "@redeemer:test.org";
    const CHILD_A: &str = "!childA:test.org";
    const CHILD_B: &str = "!childB:test.org";

    static SCHEMA_INIT: tokio::sync::OnceCell<()> = tokio::sync::OnceCell::const_new();

    fn db_url() -> String {
        std::env::var("DATABASE_URL")
            .unwrap_or_else(|_| "postgres://herald:herald@localhost:5432/herald_test".to_string())
    }

    async fn connect_db() -> Db {
        toasty::Db::builder()
            .models(toasty::models!(crate::models::invite::InviteLink))
            .connect(&db_url())
            .await
            .expect("connect test db")
    }

    async fn setup_db() -> Db {
        SCHEMA_INIT
            .get_or_init(|| async {
                let reset_handle = connect_db().await;
                reset_handle.reset_db().await.expect("reset_db");
                drop(reset_handle);
                let migrate_handle = connect_db().await;
                migrate_handle.push_schema().await.expect("push_schema");
            })
            .await;
        connect_db().await
    }

    fn make_state(db: Db, matrix: MatrixClient) -> AppState {
        let matrix_api: Arc<dyn MatrixApi> = Arc::new(matrix.clone());
        let membership = MembershipCache::new(matrix_api, Duration::from_mins(1), 100, 100);
        let subscriptions = Arc::new(SubscriptionRegistry::new());
        let presence_fanout = PresenceFanout::new(membership.clone(), subscriptions.clone());
        let presence_registry = PresenceRegistry::new(
            presence_fanout.clone(),
            Duration::from_secs(30),
            Some(db.clone()),
        );
        AppState {
            tokens: TokenCache::new(matrix.clone(), Duration::from_mins(1), 100),
            transactions: TransactionCache::new(Duration::from_mins(1), 100),
            db,
            matrix,
            config: Config::default(),
            membership,
            subscriptions,
            presence_fanout,
            presence_registry,
            shutdown: CancellationToken::new(),
        }
    }

    fn matrix_for(server: &MockServer) -> MatrixClient {
        MatrixClient::new(
            Url::parse(&server.uri()).expect("mock uri"),
            "as_token".into(),
        )
    }

    fn redeemer() -> Identity {
        Identity {
            user_id: OwnedUserId::try_from(REDEEMER_ID).expect("static REDEEMER_ID"),
            device_id: None,
        }
    }

    async fn seed_invite(db: &Db, code: &str, max_uses: Option<i64>) -> InviteLink {
        let mut db = db.clone();
        toasty::create!(InviteLink {
            code: code.to_string(),
            space_mxid: SPACE_ID.to_string(),
            creator_mxid: CREATOR_ID.to_string(),
            max_uses,
            expires_at: None,
        })
        .exec(&mut db)
        .await
        .expect("seed invite")
    }

    async fn use_count(db: &Db, code: &str) -> i64 {
        let mut db = db.clone();
        InviteLink::get_by_code(&mut db, code)
            .await
            .expect("invite present")
            .use_count
    }

    fn unique_code(suffix: &str) -> String {
        // millis-since-epoch + suffix avoids collisions when tests share a test DB.
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("system clock after UNIX epoch")
            .as_nanos();
        format!("t{now}{suffix}")
    }

    fn hierarchy_response(space: &str, children: &[(&str, bool)]) -> serde_json::Value {
        let children_state: Vec<_> = children
            .iter()
            .map(|(child_id, suggested)| {
                serde_json::json!({
                    "type": "m.space.child",
                    "state_key": child_id,
                    "sender": CREATOR_ID,
                    "origin_server_ts": 1_700_000_000_000u64,
                    "content": { "via": ["test.org"], "suggested": suggested },
                })
            })
            .collect();
        serde_json::json!({
            "rooms": [{
                "room_id": space,
                "num_joined_members": 1,
                "world_readable": false,
                "guest_can_join": false,
                "join_rule": "public",
                "children_state": children_state,
            }]
        })
    }

    fn stub_invite(status: u16) -> Mock {
        Mock::given(method("POST"))
            .and(path_regex(r"^/_matrix/client/v3/rooms/.+/invite$"))
            .respond_with(ResponseTemplate::new(status).set_body_json(serde_json::json!({})))
    }

    fn stub_join_space(status: u16) -> Mock {
        Mock::given(method("POST"))
            .and(path(format!("/_matrix/client/v3/rooms/{SPACE_ID}/join")))
            .and(query_param("user_id", REDEEMER_ID))
            .respond_with(
                ResponseTemplate::new(status)
                    .set_body_json(serde_json::json!({ "room_id": SPACE_ID })),
            )
    }

    fn stub_join_child(child: &str, status: u16) -> Mock {
        Mock::given(method("POST"))
            .and(path(format!("/_matrix/client/v3/rooms/{child}/join")))
            .and(query_param("user_id", REDEEMER_ID))
            .respond_with(
                ResponseTemplate::new(status)
                    .set_body_json(serde_json::json!({ "room_id": child })),
            )
    }

    fn stub_power_levels(actor_mxid: &str, actor_pl: i64, invite_threshold: i64) -> Mock {
        Mock::given(method("GET"))
            .and(path_regex(
                r"^/_matrix/client/v3/rooms/.+/state/m\.room\.power_levels/?$",
            ))
            .and(query_param("user_id", actor_mxid))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "invite": invite_threshold,
                "users": { actor_mxid: actor_pl },
                "users_default": 0,
            })))
    }

    fn stub_space_preview(name: &str, member_count: u64) -> Mock {
        Mock::given(method("GET"))
            .and(path_regex(
                r"^/_matrix/client/unstable/im\.nheko\.summary/summary/.+$",
            ))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "name": name,
                "num_joined_members": member_count,
            })))
    }

    fn identity(mxid: &str) -> Identity {
        Identity {
            user_id: OwnedUserId::try_from(mxid).expect("valid test mxid"),
            device_id: None,
        }
    }

    fn past_timestamp() -> jiff::Timestamp {
        jiff::Timestamp::from_second(1_577_836_800).expect("static past ts")
    }

    async fn seed_invite_full(
        db: &Db,
        code: &str,
        max_uses: Option<i64>,
        use_count: i64,
        expires_at: Option<jiff::Timestamp>,
    ) -> InviteLink {
        let mut db = db.clone();
        let mut invite = toasty::create!(InviteLink {
            code: code.to_string(),
            space_mxid: SPACE_ID.to_string(),
            creator_mxid: CREATOR_ID.to_string(),
            max_uses,
            expires_at,
        })
        .exec(&mut db)
        .await
        .expect("seed invite");

        if use_count > 0 {
            invite
                .update()
                .use_count(use_count)
                .exec(&mut db)
                .await
                .expect("seed use_count");
            InviteLink::get_by_code(&mut db, code)
                .await
                .expect("seed reload")
        } else {
            invite
        }
    }

    fn stub_hierarchy(status: u16, body: serde_json::Value) -> Mock {
        Mock::given(method("GET"))
            .and(path_regex(r"^/_matrix/client/v1/rooms/.+/hierarchy$"))
            .respond_with(ResponseTemplate::new(status).set_body_json(body))
    }

    async fn redeem_call(
        state: AppState,
        code: &str,
    ) -> Result<axum::Json<serde_json::Value>, axum::http::StatusCode> {
        redeem(Path(code.to_string()), State(state), Extension(redeemer())).await
    }

    #[tokio::test]
    async fn happy_path_invites_accepts_and_fans_out_suggested() {
        let db = setup_db().await;
        let server = MockServer::start().await;

        let code = unique_code("happy");
        seed_invite(&db, &code, Some(10)).await;

        stub_invite(200).mount(&server).await;
        stub_join_space(200).mount(&server).await;
        stub_hierarchy(
            200,
            hierarchy_response(SPACE_ID, &[(CHILD_A, true), (CHILD_B, true)]),
        )
        .mount(&server)
        .await;
        stub_join_child(CHILD_A, 200).expect(1).mount(&server).await;
        stub_join_child(CHILD_B, 200).expect(1).mount(&server).await;

        let state = make_state(db.clone(), matrix_for(&server));
        let res = redeem_call(state, &code).await.expect("redeem ok");
        assert_eq!(res.0["spaceMxid"], SPACE_ID);
        assert_eq!(use_count(&db, &code).await, 1);
    }

    #[tokio::test]
    async fn invite_failure_returns_502_and_does_not_burn_use() {
        let db = setup_db().await;
        let server = MockServer::start().await;

        let code = unique_code("invfail");
        seed_invite(&db, &code, Some(10)).await;

        stub_invite(500).mount(&server).await;
        stub_join_space(200).expect(0).mount(&server).await;

        let state = make_state(db.clone(), matrix_for(&server));
        let err = redeem_call(state, &code).await.expect_err("redeem err");
        assert_eq!(err, axum::http::StatusCode::BAD_GATEWAY);
        assert_eq!(use_count(&db, &code).await, 0);
    }

    #[tokio::test]
    async fn join_space_failure_returns_502_and_does_not_burn_use() {
        let db = setup_db().await;
        let server = MockServer::start().await;

        let code = unique_code("joinfail");
        seed_invite(&db, &code, Some(10)).await;

        stub_invite(200).mount(&server).await;
        stub_join_space(500).mount(&server).await;

        let state = make_state(db.clone(), matrix_for(&server));
        let err = redeem_call(state, &code).await.expect_err("redeem err");
        assert_eq!(err, axum::http::StatusCode::BAD_GATEWAY);
        assert_eq!(use_count(&db, &code).await, 0);
    }

    #[tokio::test]
    async fn hierarchy_failure_still_returns_200_with_use_burned() {
        let db = setup_db().await;
        let server = MockServer::start().await;

        let code = unique_code("hierfail");
        seed_invite(&db, &code, Some(10)).await;

        stub_invite(200).mount(&server).await;
        stub_join_space(200).mount(&server).await;
        stub_hierarchy(500, serde_json::json!({}))
            .mount(&server)
            .await;
        // No child stubs — none should be attempted.
        stub_join_child(CHILD_A, 200).expect(0).mount(&server).await;

        let state = make_state(db.clone(), matrix_for(&server));
        let res = redeem_call(state, &code).await.expect("redeem ok");
        assert_eq!(res.0["spaceMxid"], SPACE_ID);
        assert_eq!(use_count(&db, &code).await, 1);
    }

    #[tokio::test]
    async fn per_child_failure_does_not_abort_other_children() {
        let db = setup_db().await;
        let server = MockServer::start().await;

        let code = unique_code("childfail");
        seed_invite(&db, &code, Some(10)).await;

        stub_invite(200).mount(&server).await;
        stub_join_space(200).mount(&server).await;
        stub_hierarchy(
            200,
            hierarchy_response(SPACE_ID, &[(CHILD_A, true), (CHILD_B, true)]),
        )
        .mount(&server)
        .await;
        // Child A fails, child B succeeds. Both still attempted exactly once.
        stub_join_child(CHILD_A, 500).expect(1).mount(&server).await;
        stub_join_child(CHILD_B, 200).expect(1).mount(&server).await;

        let state = make_state(db.clone(), matrix_for(&server));
        let res = redeem_call(state, &code).await.expect("redeem ok");
        assert_eq!(res.0["spaceMxid"], SPACE_ID);
        assert_eq!(use_count(&db, &code).await, 1);
    }

    #[tokio::test]
    async fn create_persists_and_returns_201() {
        let db = setup_db().await;
        let server = MockServer::start().await;

        stub_power_levels(CREATOR_ID, 100, 50).mount(&server).await;

        let state = make_state(db.clone(), matrix_for(&server));
        let code = unique_code("create");
        let (status, body) = create(
            State(state),
            Extension(identity(CREATOR_ID)),
            axum::Json(CreateInvite {
                space_mxid: SPACE_ID.to_string(),
                code: Some(code.clone()),
                max_uses: Some(5),
                expires_at: None,
            }),
        )
        .await
        .expect("create ok");

        assert_eq!(status, StatusCode::CREATED);
        assert_eq!(body.0.code, code);
        assert_eq!(body.0.max_uses, Some(5));

        let mut db_check = db.clone();
        let persisted = InviteLink::get_by_code(&mut db_check, &code)
            .await
            .expect("invite persisted");
        assert_eq!(persisted.creator_mxid, CREATOR_ID);
    }

    #[tokio::test]
    async fn create_forbidden_when_user_lacks_invite_pl() {
        let db = setup_db().await;
        let server = MockServer::start().await;

        // Actor has default PL (0), invite threshold is 50.
        let actor = "@nobody:test.org";
        stub_power_levels(actor, 0, 50).mount(&server).await;

        let state = make_state(db.clone(), matrix_for(&server));
        let err = create(
            State(state),
            Extension(identity(actor)),
            axum::Json(CreateInvite {
                space_mxid: SPACE_ID.to_string(),
                code: Some(unique_code("forbid")),
                max_uses: None,
                expires_at: None,
            }),
        )
        .await
        .expect_err("create forbidden");

        assert_eq!(err, StatusCode::FORBIDDEN);
    }

    #[tokio::test]
    async fn create_rejects_invalid_code() {
        let db = setup_db().await;
        let server = MockServer::start().await;
        stub_power_levels(CREATOR_ID, 100, 50).mount(&server).await;

        let state = make_state(db.clone(), matrix_for(&server));
        let err = create(
            State(state),
            Extension(identity(CREATOR_ID)),
            axum::Json(CreateInvite {
                space_mxid: SPACE_ID.to_string(),
                code: Some("!!".to_string()),
                max_uses: None,
                expires_at: None,
            }),
        )
        .await
        .expect_err("invalid code rejected");

        assert_eq!(err, StatusCode::UNPROCESSABLE_ENTITY);
    }

    #[tokio::test]
    async fn show_returns_invite_with_preview() {
        let db = setup_db().await;
        let server = MockServer::start().await;

        let code = unique_code("show");
        seed_invite(&db, &code, Some(10)).await;
        stub_space_preview("Test Space", 42).mount(&server).await;

        let state = make_state(db.clone(), matrix_for(&server));
        let res = show(Path(code.clone()), State(state))
            .await
            .expect("show ok");
        assert_eq!(res.0.invite.code, code);
        assert_eq!(res.0.name.as_deref(), Some("Test Space"));
        assert_eq!(res.0.member_count, Some(42));
    }

    #[tokio::test]
    async fn show_returns_404_when_expired() {
        let db = setup_db().await;
        let server = MockServer::start().await;

        let code = unique_code("showexp");
        seed_invite_full(&db, &code, None, 0, Some(past_timestamp())).await;

        let state = make_state(db.clone(), matrix_for(&server));
        let Err(err) = show(Path(code), State(state)).await else {
            panic!("expected NOT_FOUND");
        };
        assert_eq!(err, StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn destroy_by_creator_returns_204_and_removes_row() {
        let db = setup_db().await;
        let server = MockServer::start().await;

        let code = unique_code("destroy");
        seed_invite(&db, &code, None).await;

        let state = make_state(db.clone(), matrix_for(&server));
        let status = destroy(
            Path(code.clone()),
            State(state),
            Extension(identity(CREATOR_ID)),
        )
        .await
        .expect("destroy ok");
        assert_eq!(status, StatusCode::NO_CONTENT);

        let mut db_check = db.clone();
        InviteLink::get_by_code(&mut db_check, &code)
            .await
            .expect_err("invite should be deleted");
    }

    #[tokio::test]
    async fn destroy_by_other_returns_403_when_lacks_pl() {
        let db = setup_db().await;
        let server = MockServer::start().await;

        let code = unique_code("destroyforbid");
        seed_invite(&db, &code, None).await;

        let actor = "@stranger:test.org";
        stub_power_levels(actor, 0, 50).mount(&server).await;

        let state = make_state(db.clone(), matrix_for(&server));
        let err = destroy(Path(code.clone()), State(state), Extension(identity(actor)))
            .await
            .expect_err("destroy forbidden");
        assert_eq!(err, StatusCode::FORBIDDEN);

        let mut db_check = db.clone();
        InviteLink::get_by_code(&mut db_check, &code)
            .await
            .expect("invite still present");
    }

    #[tokio::test]
    async fn redeem_expired_returns_410() {
        let db = setup_db().await;
        let server = MockServer::start().await;

        let code = unique_code("expired");
        seed_invite_full(&db, &code, None, 0, Some(past_timestamp())).await;
        // No Matrix stubs — handler must short-circuit before any call.

        let state = make_state(db.clone(), matrix_for(&server));
        let err = redeem_call(state, &code).await.expect_err("redeem err");
        assert_eq!(err, StatusCode::GONE);
        assert_eq!(use_count(&db, &code).await, 0);
    }

    #[tokio::test]
    async fn redeem_maxed_out_returns_403() {
        let db = setup_db().await;
        let server = MockServer::start().await;

        let code = unique_code("maxed");
        seed_invite_full(&db, &code, Some(1), 1, None).await;

        let state = make_state(db.clone(), matrix_for(&server));
        let err = redeem_call(state, &code).await.expect_err("redeem err");
        assert_eq!(err, StatusCode::FORBIDDEN);
        assert_eq!(use_count(&db, &code).await, 1);
    }
}
