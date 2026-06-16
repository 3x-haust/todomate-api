import { describe, expect, test } from "bun:test";
import { SessionCodec } from "../src/session-codec.ts";

const testSessionKey = "a".repeat(64);

describe("SessionCodec", () => {
  test("encrypts Firebase refresh token and rejects expired sessions", () => {
    const codec = new SessionCodec({
      key: testSessionKey,
      now: () => 1_800_000_000_000,
    });

    const token = codec.encode({
      expiresAt: 1_800_000_001_000,
      issuedAt: 1_800_000_000_000,
      refreshToken: "refresh-secret",
      uid: "uid-1",
    });

    expect(token).not.toContain("refresh-secret");
    expect(codec.decode(token)).toEqual({
      expiresAt: 1_800_000_001_000,
      issuedAt: 1_800_000_000_000,
      refreshToken: "refresh-secret",
      uid: "uid-1",
    });

    const expiredCodec = new SessionCodec({
      key: testSessionKey,
      now: () => 1_800_000_002_000,
    });
    expect(() => expiredCodec.decode(token)).toThrow("Session expired");
  });

  test("reports malformed tokens as unauthorized session errors", () => {
    const codec = new SessionCodec({
      key: testSessionKey,
      now: () => 1_800_000_000_000,
    });

    expect(() => codec.decode("v1.bad.bad.bad")).toThrow("Session token is invalid");
  });
});
