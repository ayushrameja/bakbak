import { describe, expect, it } from "vitest";
import {
  readableTusUploadError,
  signedResumableEndpoint,
  signedResumableHeaders,
} from "./message-media-service";

describe("signed resumable message uploads", () => {
  it("uses Supabase's signed TUS endpoint on hosted and local projects", () => {
    expect(signedResumableEndpoint("https://project-ref.supabase.co")).toBe(
      "https://project-ref.storage.supabase.co/storage/v1/upload/resumable/sign",
    );
    expect(signedResumableEndpoint("http://127.0.0.1:54321")).toBe(
      "http://127.0.0.1:54321/storage/v1/upload/resumable/sign",
    );
  });

  it("authorizes the signed endpoint with the project key and scoped signature", () => {
    expect(signedResumableHeaders("public-key", "signed-path-token")).toEqual({
      apikey: "public-key",
      "x-signature": "signed-path-token",
    });
  });

  it("turns Storage authorization failures into a retryable user message", () => {
    const failure = readableTusUploadError({
      originalResponse: {
        getStatus: () => 403,
      },
    });

    expect(failure.message).toContain("secure media upload was rejected");
  });
});
