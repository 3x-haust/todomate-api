import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { z } from "zod";
import { TodomateError } from "./errors.ts";

const sessionPayloadSchema = z.object({
  expiresAt: z.number().int().positive(),
  issuedAt: z.number().int().positive(),
  refreshToken: z.string().min(1),
  uid: z.string().min(1),
});

export type SessionPayload = z.infer<typeof sessionPayloadSchema>;

type SessionCodecOptions = {
  readonly key: string;
  readonly now?: () => number;
};

export class SessionCodec {
  private readonly key: Buffer;
  private readonly now: () => number;

  constructor(options: SessionCodecOptions) {
    const key = options.key.trim();
    if (!/^[a-fA-F0-9]{64}$/.test(key)) {
      throw new TodomateError(
        "SESSION_KEY_INVALID",
        "SESSION_ENCRYPTION_KEY must be 64 hex characters",
        500,
      );
    }
    this.key = Buffer.from(key, "hex");
    this.now = options.now ?? Date.now;
  }

  encode(payload: SessionPayload): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(payload), "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    return ["v1", base64Url(iv), base64Url(encrypted), base64Url(tag)].join(".");
  }

  decode(token: string): SessionPayload {
    const parts = token.split(".");
    const version = parts[0];
    const iv = parts[1];
    const encrypted = parts[2];
    const tag = parts[3];
    if (version !== "v1" || iv === undefined || encrypted === undefined || tag === undefined) {
      throw invalidSession();
    }

    const parsed = decodePayload(this.key, iv, encrypted, tag);
    if (parsed.expiresAt <= this.now()) {
      throw new TodomateError("SESSION_EXPIRED", "Session expired", 401);
    }
    return parsed;
  }
}

function decodePayload(key: Buffer, iv: string, encrypted: string, tag: string): SessionPayload {
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, fromBase64Url(iv));
    decipher.setAuthTag(fromBase64Url(tag));
    const plaintext = Buffer.concat([
      decipher.update(fromBase64Url(encrypted)),
      decipher.final(),
    ]).toString("utf8");
    return sessionPayloadSchema.parse(JSON.parse(plaintext));
  } catch (error) {
    if (error instanceof TodomateError) {
      throw error;
    }
    throw invalidSession();
  }
}

function invalidSession(): TodomateError {
  return new TodomateError("SESSION_INVALID", "Session token is invalid", 401);
}

function base64Url(buffer: Buffer): string {
  return buffer.toString("base64").replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function fromBase64Url(value: string): Buffer {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  return Buffer.from(`${base64}${padding}`, "base64");
}
