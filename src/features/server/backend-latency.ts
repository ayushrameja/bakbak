import { useEffect, useState } from "react";
import type { DataMode } from "../../lib/types";

const POLL_INTERVAL_MS = 30_000;

export type BackendLatency =
  | { status: "checking" }
  | { status: "available"; milliseconds: number }
  | { status: "unavailable" };

export function backendLatencyLabel(
  mode: DataMode,
  latency: BackendLatency,
): string {
  if (mode === "mock") return "Local";
  if (latency.status === "available") return `${latency.milliseconds} ms`;
  return latency.status === "unavailable" ? "Retrying" : "Checking";
}

export function useBackendLatency(
  mode: DataMode,
  backendUrl: string,
): BackendLatency {
  const [latency, setLatency] = useState<BackendLatency>(() =>
    mode === "mock"
      ? { status: "available", milliseconds: 0 }
      : { status: "checking" },
  );

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

  return latency;
}
