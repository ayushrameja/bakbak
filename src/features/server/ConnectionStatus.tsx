import { Cloud, Radio, Wifi } from "lucide-react";
import { useEffect, useId, useState } from "react";
import type { DataMode } from "../../lib/types";

const POLL_INTERVAL_MS = 30_000;

type Latency =
  | { status: "checking" }
  | { status: "available"; milliseconds: number }
  | { status: "unavailable" };

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
  const [latency, setLatency] = useState<Latency>(() =>
    mode === "mock"
      ? { status: "available", milliseconds: 0 }
      : { status: "checking" },
  );
  const detailId = useId();

  useEffect(() => {
    if (mode === "mock" || !backendUrl) return;

    let active = true;
    let controller: AbortController | null = null;

    const measure = async () => {
      controller?.abort();
      const nextController = new AbortController();
      controller = nextController;
      const startedAt = performance.now();
      setLatency({ status: "checking" });

      try {
        await fetch(`${backendUrl}/auth/v1/health`, {
          cache: "no-store",
          signal: nextController.signal,
        });
        if (active) {
          setLatency({
            status: "available",
            milliseconds: Math.round(performance.now() - startedAt),
          });
        }
      } catch {
        if (active && !nextController.signal.aborted) {
          setLatency({ status: "unavailable" });
        }
      }
    };

    void measure();
    const interval = window.setInterval(() => void measure(), POLL_INTERVAL_MS);
    return () => {
      active = false;
      controller?.abort();
      window.clearInterval(interval);
    };
  }, [backendUrl, mode]);

  const latencyLabel =
    mode === "mock"
      ? "Local"
      : latency.status === "available"
        ? `${latency.milliseconds} ms`
        : latency.status === "unavailable"
          ? "Retrying"
          : "Checking";

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
