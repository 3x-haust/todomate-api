import { createHash } from "node:crypto";
import type { Context } from "hono";
import type { z } from "zod";

type ErrorStatus = 400 | 401 | 403 | 404 | 429 | 500 | 502;

export async function requestJson(c: Context): Promise<unknown> {
  return c.req.json().catch(() => undefined);
}

export function bearerToken(c: Context): string | null {
  const header = c.req.header("authorization");
  if (header === undefined) {
    return null;
  }
  const prefix = "Bearer ";
  return header.startsWith(prefix) ? header.slice(prefix.length) : null;
}

export function loginRateLimitKey(c: Context): string {
  return `login:${remoteAddress(c)}`;
}

export function requestRateLimitKey(c: Context, token: string | null): string {
  if (token !== null) {
    return `session:${hashToken(token)}`;
  }
  return `request:${remoteAddress(c)}`;
}

export function validationError(c: Context, error: z.ZodError): Response {
  return c.json(
    {
      error: {
        code: "VALIDATION_ERROR",
        issues: error.issues,
        message: "Request validation failed",
      },
    },
    400,
  );
}

export function httpStatus(status: number): ErrorStatus {
  switch (status) {
    case 400:
    case 401:
    case 403:
    case 404:
    case 429:
    case 500:
    case 502:
      return status;
    default:
      return 500;
  }
}

function remoteAddress(c: Context): string {
  return c.req.header("x-todomate-remote-address") ?? "runtime:unknown";
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
