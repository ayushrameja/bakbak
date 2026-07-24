import { describe, expect, it } from "vitest";
import { isConnectivityError } from "./connectivity";

describe("connectivity errors", () => {
  it("recognizes browser fetch failures, including wrapped causes", () => {
    const failure = new TypeError("Failed to fetch");

    expect(isConnectivityError(failure)).toBe(true);
    expect(
      isConnectivityError(
        new Error("Could not load messages", { cause: failure }),
      ),
    ).toBe(true);
  });

  it("does not call PostgREST contract failures offline", () => {
    expect(
      isConnectivityError({
        code: "PGRST200",
        message: "Could not find a relationship in the schema cache",
      }),
    ).toBe(false);
    expect(
      isConnectivityError(new Error("Direct messages could not be loaded.")),
    ).toBe(false);
    expect(
      isConnectivityError(new TypeError("Cannot read properties of null")),
    ).toBe(false);
  });
});
