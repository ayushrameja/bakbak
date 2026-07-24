const NETWORK_ERROR_PATTERNS = [
  "failed to fetch",
  "load failed",
  "networkerror",
  "network error",
  "connection refused",
];

export function isConnectivityError(error: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return true;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (NETWORK_ERROR_PATTERNS.some((pattern) => message.includes(pattern))) {
      return true;
    }
    return isConnectivityError(error.cause);
  }

  return false;
}
