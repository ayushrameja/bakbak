import { Cloud, Radio, Wifi } from "lucide-react";
import { useId } from "react";
import type { DataMode } from "../../lib/types";
import { backendLatencyLabel, useBackendLatency } from "./backend-latency";

interface ConnectionStatusProps {
  mode: DataMode;
  backendUrl: string;
  backendRegion: string;
  voiceConnected: boolean;
}

export function ConnectionStatus({
  mode,
  backendUrl,
  backendRegion,
  voiceConnected,
}: ConnectionStatusProps) {
  const latency = useBackendLatency(mode, backendUrl);
  const detailId = useId();
  const latencyLabel = backendLatencyLabel(mode, latency);

  return (
    <div
      className="connection-status"
      tabIndex={0}
      role="status"
      aria-describedby={detailId}
      aria-label={`Connection status: ${latencyLabel}`}
    >
      <Wifi size={14} />
      <span>{latencyLabel}</span>
      <div className="connection-status__detail" id={detailId} role="tooltip">
        <div>
          <Cloud size={14} />
          <span>
            <strong>Backend</strong>
            <small>
              {mode === "mock" ? "Local preview only" : backendRegion}
            </small>
          </span>
          <b>{latencyLabel}</b>
        </div>
        <div>
          <Radio size={14} />
          <span>
            <strong>Voice</strong>
            <small>India West</small>
          </span>
          <b>{voiceConnected ? "Connected" : "Standby"}</b>
        </div>
      </div>
    </div>
  );
}
