import { createContext, useContext } from "react";

export type AppUpdateStatus =
  | "idle"
  | "checking"
  | "up-to-date"
  | "available"
  | "offline"
  | "failed"
  | "installing"
  | "install-failed"
  | "unsupported";

export type AppUpdateFailure = "offline" | "timeout" | "service" | "install";

export interface AppUpdateContextValue {
  status: AppUpdateStatus;
  failure: AppUpdateFailure | null;
  availableVersion: string | null;
  attempt: number;
  maxAttempts: number;
  lastCheckedAt: string | null;
  lastSuccessfulCheckAt: string | null;
  downloadedBytes: number;
  contentLength: number | null;
  checkForUpdates: () => Promise<void>;
  installUpdate: () => Promise<void>;
  openReleasesPage: () => Promise<void>;
  copyDiagnostics: () => Promise<boolean>;
}

export const AppUpdateContext = createContext<AppUpdateContextValue | null>(
  null,
);

export function useAppUpdate(): AppUpdateContextValue {
  const value = useContext(AppUpdateContext);
  if (!value) {
    throw new Error("useAppUpdate must be used inside AppUpdateProvider.");
  }
  return value;
}
