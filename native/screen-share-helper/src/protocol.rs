use serde::Serialize;

use crate::model::{HelperError, LifecyclePayload, PROTOCOL_VERSION};

#[derive(Serialize)]
#[serde(untagged)]
pub enum Outbound {
    Response(ResponseEnvelope),
    Event(EventEnvelope),
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResponseEnvelope {
    pub protocol_version: u32,
    pub request_id: String,
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<HelperError>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EventEnvelope {
    pub protocol_version: u32,
    pub event: &'static str,
    pub payload: LifecyclePayload,
}

pub fn success<T: Serialize>(request_id: String, result: T) -> Outbound {
    let result = serde_json::to_value(result).unwrap_or_else(|_| serde_json::json!({}));
    Outbound::Response(ResponseEnvelope {
        protocol_version: PROTOCOL_VERSION,
        request_id,
        ok: true,
        result: Some(result),
        error: None,
    })
}

pub fn failure(request_id: String, error: HelperError) -> Outbound {
    Outbound::Response(ResponseEnvelope {
        protocol_version: PROTOCOL_VERSION,
        request_id,
        ok: false,
        result: None,
        error: Some(error),
    })
}

pub fn lifecycle(payload: LifecyclePayload) -> Outbound {
    Outbound::Event(EventEnvelope {
        protocol_version: PROTOCOL_VERSION,
        event: "lifecycle",
        payload,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{LifecycleState, StopResult};

    #[test]
    fn serializes_locked_v1_response_shape() {
        let value = serde_json::to_value(success(
            "req-1".to_string(),
            StopResult {
                session_id: "session-1".to_string(),
                stopped: true,
            },
        ))
        .unwrap();
        assert_eq!(value["protocolVersion"], 1);
        assert_eq!(value["requestId"], "req-1");
        assert_eq!(value["ok"], true);
        assert_eq!(value["result"]["stopped"], true);
        assert!(value.get("event").is_none());
    }

    #[test]
    fn serializes_locked_lifecycle_event_shape() {
        let value = serde_json::to_value(lifecycle(LifecyclePayload {
            session_id: Some("session-1".into()),
            state: LifecycleState::AudioDowngraded,
            reason_code: Some("audio-isolation-lost".into()),
            message: Some("Video is still sharing.".into()),
            audio_published: Some(false),
        }))
        .unwrap();
        assert_eq!(value["protocolVersion"], 1);
        assert_eq!(value["event"], "lifecycle");
        assert_eq!(value["payload"]["state"], "audio-downgraded");
        assert!(value.get("requestId").is_none());
    }
}
