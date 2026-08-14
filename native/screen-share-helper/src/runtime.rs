use serde::de::DeserializeOwned;
use tokio::sync::mpsc;
use url::Url;

use crate::{
    HELPER_VERSION,
    model::{
        Command, HelloResult, HelperError, LifecyclePayload, LifecycleState, ListSourcesPayload,
        ListSourcesResult, PROTOCOL_VERSION, Request, StartPayload, StopPayload, StopResult,
        UpdatePayload,
    },
    platform,
    policy::HostIdentity,
    protocol::{Outbound, failure, lifecycle, success},
    publisher::PublisherSession,
};

pub struct HelperRuntime {
    host: Option<HostIdentity>,
    active: Option<PublisherSession>,
    outbound: mpsc::UnboundedSender<Outbound>,
}

impl HelperRuntime {
    pub fn new(outbound: mpsc::UnboundedSender<Outbound>) -> Self {
        Self {
            host: None,
            active: None,
            outbound,
        }
    }

    pub async fn handle(&mut self, mut request: Request) -> bool {
        let request_id = normalize_request_id(&request.request_id);
        if request.protocol_version != PROTOCOL_VERSION {
            self.send(failure(
                request_id,
                HelperError::invalid(
                    "unsupported-protocol",
                    "The desktop app and native helper use different protocol versions.",
                ),
            ));
            return false;
        }
        if request.request_id.is_empty() || request.request_id.len() > 128 {
            self.send(failure(
                request_id,
                HelperError::invalid("invalid-request", "The request identifier is invalid."),
            ));
            return false;
        }

        if self.host.is_none() && request.command != Command::Hello {
            self.send(failure(
                request_id,
                HelperError::invalid("hello-required", "The helper handshake must run first."),
            ));
            return false;
        }

        let payload = std::mem::take(&mut request.payload);
        let mut should_exit = false;
        let result = match request.command {
            Command::Hello => self
                .hello(payload)
                .await
                .map(|value| success(request_id.clone(), value)),
            Command::Capabilities => empty_payload(payload)
                .map(|()| success(request_id.clone(), platform::capabilities())),
            Command::ListSources => self
                .list_sources(payload)
                .await
                .map(|value| success(request_id.clone(), value)),
            Command::Start => self
                .start(payload)
                .await
                .map(|value| success(request_id.clone(), value)),
            Command::Update => self
                .update(payload)
                .await
                .map(|value| success(request_id.clone(), value)),
            Command::Stop => self
                .stop(payload)
                .await
                .map(|value| success(request_id.clone(), value)),
            Command::Shutdown => {
                let parsed = empty_payload(payload);
                if parsed.is_ok() {
                    self.shutdown().await;
                    should_exit = true;
                }
                parsed
                    .map(|()| success(request_id.clone(), serde_json::json!({ "accepted": true })))
            }
        };
        match result {
            Ok(message) => self.send(message),
            Err(error) => self.send(failure(request_id, error)),
        }
        should_exit
    }

    async fn hello(&mut self, payload: serde_json::Value) -> Result<HelloResult, HelperError> {
        if self.host.is_some() {
            return Err(HelperError::invalid(
                "hello-already-complete",
                "The helper handshake is already complete.",
            ));
        }
        let host = HostIdentity::from_hello(parse_payload(payload)?)?;
        platform::verify_host(&host)?;
        self.host = Some(host);
        self.send(lifecycle(LifecyclePayload {
            session_id: None,
            state: LifecycleState::Ready,
            reason_code: None,
            message: None,
            audio_published: None,
        }));
        Ok(HelloResult {
            protocol_version: PROTOCOL_VERSION,
            helper_version: HELPER_VERSION.to_string(),
            platform: platform::platform_name(),
            capabilities: platform::capabilities(),
        })
    }

    async fn list_sources(
        &self,
        payload: serde_json::Value,
    ) -> Result<ListSourcesResult, HelperError> {
        let input: ListSourcesPayload = parse_payload(payload)?;
        let host = self.host.as_ref().expect("hello gate");
        let mut sources = platform::sources(host, input.include_thumbnails).await?;
        let truncated = sources.len() > crate::model::MAX_SOURCES;
        sources.truncate(crate::model::MAX_SOURCES);
        Ok(ListSourcesResult { sources, truncated })
    }

    async fn start(
        &mut self,
        payload: serde_json::Value,
    ) -> Result<crate::model::StartResult, HelperError> {
        self.reap_finished().await;
        if self.active.is_some() {
            return Err(HelperError::invalid(
                "share-already-active",
                "A screen share is already active.",
            ));
        }
        let input: StartPayload = parse_payload(payload)?;
        validate_start(&input)?;
        self.send(lifecycle(LifecyclePayload {
            session_id: None,
            state: LifecycleState::Starting,
            reason_code: None,
            message: None,
            audio_published: None,
        }));
        let session = PublisherSession::start(
            self.host.as_ref().expect("hello gate"),
            input,
            self.outbound.clone(),
        )
        .await?;
        let result = session.result().clone();
        self.active = Some(session);
        self.send(lifecycle(LifecyclePayload {
            session_id: Some(result.session_id.clone()),
            state: LifecycleState::Live,
            reason_code: None,
            message: result.audio_unavailable_reason.clone(),
            audio_published: Some(result.audio_published),
        }));
        Ok(result)
    }

    async fn update(
        &mut self,
        payload: serde_json::Value,
    ) -> Result<crate::model::UpdateResult, HelperError> {
        let input: UpdatePayload = parse_payload(payload)?;
        validate_session_id(&input.session_id)?;
        let session = self.active.as_mut().ok_or_else(|| {
            HelperError::invalid("no-active-share", "There is no active screen share.")
        })?;
        session.update(input).await
    }

    async fn stop(&mut self, payload: serde_json::Value) -> Result<StopResult, HelperError> {
        let input: StopPayload = parse_payload(payload)?;
        validate_session_id(&input.session_id)?;
        let session = self.active.take().ok_or_else(|| {
            HelperError::invalid("no-active-share", "There is no active screen share.")
        })?;
        if session.session_id() != input.session_id {
            self.active = Some(session);
            return Err(HelperError::invalid(
                "stale-session",
                "The requested screen-share session is no longer active.",
            ));
        }
        self.send(lifecycle(LifecyclePayload {
            session_id: Some(input.session_id.clone()),
            state: LifecycleState::Stopping,
            reason_code: None,
            message: None,
            audio_published: None,
        }));
        session.stop().await;
        self.send(lifecycle(LifecyclePayload {
            session_id: Some(input.session_id.clone()),
            state: LifecycleState::Stopped,
            reason_code: Some("requested".into()),
            message: None,
            audio_published: Some(false),
        }));
        Ok(StopResult {
            session_id: input.session_id,
            stopped: true,
        })
    }

    async fn shutdown(&mut self) {
        self.send(lifecycle(LifecyclePayload {
            session_id: self.active.as_ref().map(|session| session.session_id()),
            state: LifecycleState::ShuttingDown,
            reason_code: None,
            message: None,
            audio_published: Some(false),
        }));
        if let Some(session) = self.active.take() {
            session.stop().await;
        }
    }

    async fn reap_finished(&mut self) {
        if should_reap_finished(self.active.as_ref().map(PublisherSession::is_finished))
            && let Some(session) = self.active.take()
        {
            session.stop().await;
        }
    }

    fn send(&self, message: Outbound) {
        let _ = self.outbound.send(message);
    }
}

fn should_reap_finished(active_finished: Option<bool>) -> bool {
    active_finished == Some(true)
}

fn parse_payload<T: DeserializeOwned>(payload: serde_json::Value) -> Result<T, HelperError> {
    serde_json::from_value(payload)
        .map_err(|_| HelperError::invalid("invalid-payload", "The request payload is invalid."))
}

fn empty_payload(payload: serde_json::Value) -> Result<(), HelperError> {
    if payload.is_null() || payload.as_object().is_some_and(serde_json::Map::is_empty) {
        Ok(())
    } else {
        Err(HelperError::invalid(
            "invalid-payload",
            "This command does not accept payload fields.",
        ))
    }
}

fn validate_start(input: &StartPayload) -> Result<(), HelperError> {
    input.token.validate()?;
    input.settings.validate()?;
    if input.source_id.is_empty()
        || input.source_id.len() > 256
        || input.source_id.contains(['\n', '\r'])
    {
        return Err(HelperError::invalid(
            "invalid-source",
            "The selected source identifier is invalid.",
        ));
    }
    let url = Url::parse(&input.server_url).map_err(|_| {
        HelperError::invalid("invalid-server", "The LiveKit server URL is invalid.")
    })?;
    if input.server_url.len() > 2048
        || url.scheme() != "wss"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.host_str().is_none()
        || url.fragment().is_some()
    {
        return Err(HelperError::invalid(
            "invalid-server",
            "The LiveKit server must be a credential-free wss URL.",
        ));
    }
    Ok(())
}

fn validate_session_id(value: &str) -> Result<(), HelperError> {
    uuid::Uuid::parse_str(value)
        .map(|_| ())
        .map_err(|_| HelperError::invalid("invalid-session", "The session identifier is invalid."))
}

fn normalize_request_id(value: &str) -> String {
    if value.is_empty() || value.len() > 128 {
        "unknown".to_string()
    } else {
        value.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_non_wss_and_credentialed_servers() {
        let token: crate::model::SensitiveToken =
            serde_json::from_value(serde_json::json!("abcdefgh.ijklmnop.qrstuvwx")).unwrap();
        let input = StartPayload {
            server_url: "https://user:pass@example.test".into(),
            token,
            source_id: "display:1".into(),
            include_audio: true,
            settings: crate::model::CaptureSettings {
                width: 1920,
                height: 1080,
                frame_rate: 30,
                max_bitrate: 5_000_000,
            },
        };
        assert_eq!(validate_start(&input).unwrap_err().code, "invalid-server");
    }

    #[test]
    fn rejects_unknown_payload_fields() {
        let result: Result<crate::model::HelloPayload, _> = parse_payload(serde_json::json!({
            "electronRootPid": 42,
            "bundleId": "com.bakbak.desktop",
            "appVersion": "1.0.0",
            "token": "must-not-be-accepted"
        }));
        assert_eq!(result.unwrap_err().code, "invalid-payload");
    }

    #[test]
    fn ended_session_is_reaped_before_a_later_start() {
        assert!(should_reap_finished(Some(true)));
        assert!(!should_reap_finished(Some(false)));
        assert!(!should_reap_finished(None));
    }
}
