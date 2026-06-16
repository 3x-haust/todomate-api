import type { Context } from "hono";
import { loadRuntimeConfig, type RuntimeConfig } from "../config.ts";
import { TodomateError } from "../errors.ts";
import { FixedWindowRateLimit } from "../rate-limit.ts";
import { runtimeEnv } from "../runtime-env.ts";
import { SessionCodec, type SessionPayload } from "../session-codec.ts";
import type { TodomateApi } from "../todomate-api.ts";
import { TodomateClient } from "../todomate-client.ts";
import { bearerToken, requestRateLimitKey } from "./http-helpers.ts";

export type CreateAppOptions = {
  readonly client?: TodomateApi;
  readonly clientFactory?: (session: SessionPayload) => Promise<TodomateApi> | TodomateApi;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly loginRateLimit?: FixedWindowRateLimit;
  readonly requestRateLimit?: FixedWindowRateLimit;
  readonly sessionCodec?: SessionCodec;
  readonly socialWritesEnabled?: boolean;
};

export type AppContext = {
  readonly config: RuntimeConfig;
  readonly getClient: (c: Context) => Promise<TodomateApi>;
  readonly getFirebaseApiKey: () => string;
  readonly getSessionCodec: () => SessionCodec;
  readonly loginRateLimit: FixedWindowRateLimit;
  readonly requestRateLimit: FixedWindowRateLimit;
  readonly socialWritesEnabled: boolean;
};

export function createServerContext(options: CreateAppOptions = {}): AppContext {
  const env = options.env ?? runtimeEnv();
  const config = loadRuntimeConfig(env);
  const socialWritesEnabled = options.socialWritesEnabled ?? config.socialWritesEnabled;
  const loginRateLimit =
    options.loginRateLimit ?? new FixedWindowRateLimit({ limit: 10, windowMs: 60_000 });
  const requestRateLimit =
    options.requestRateLimit ?? new FixedWindowRateLimit({ limit: 600, windowMs: 60_000 });
  let liveSessionCodec: SessionCodec | undefined;

  if (options.client === undefined && options.sessionCodec === undefined) {
    if (config.sessionEncryptionKey === null) {
      throw new TodomateError(
        "SESSION_KEY_MISSING",
        "SESSION_ENCRYPTION_KEY is required for API server mode",
        500,
      );
    }
    liveSessionCodec = new SessionCodec({ key: config.sessionEncryptionKey });
  }

  const getSessionCodec = (): SessionCodec => {
    if (options.sessionCodec !== undefined) {
      return options.sessionCodec;
    }
    if (liveSessionCodec !== undefined) {
      return liveSessionCodec;
    }
    if (config.sessionEncryptionKey === null) {
      throw new TodomateError(
        "SESSION_KEY_MISSING",
        "SESSION_ENCRYPTION_KEY is required for API server mode",
        500,
      );
    }
    liveSessionCodec = new SessionCodec({ key: config.sessionEncryptionKey });
    return liveSessionCodec;
  };

  const getFirebaseApiKey = (): string => {
    if (config.firebaseApiKey !== null) {
      return config.firebaseApiKey;
    }
    throw new TodomateError(
      "FIREBASE_API_KEY_MISSING",
      "TODOMATE_FIREBASE_API_KEY is required for live Todomate API calls",
      500,
    );
  };

  const createClientFromSession = async (session: SessionPayload): Promise<TodomateApi> => {
    if (options.clientFactory !== undefined) {
      return options.clientFactory(session);
    }
    return TodomateClient.fromRefreshToken({
      firebaseApiKey: getFirebaseApiKey(),
      refreshToken: session.refreshToken,
      socialWritesEnabled,
    });
  };

  const getClient = async (c: Context): Promise<TodomateApi> => {
    if (options.client !== undefined) {
      return options.client;
    }
    const token = bearerToken(c);
    if (!requestRateLimit.consume(requestRateLimitKey(c, token))) {
      throw new TodomateError("RATE_LIMITED", "Too many requests. Try again later.", 429);
    }
    if (token !== null) {
      return createClientFromSession(getSessionCodec().decode(token));
    }
    throw new TodomateError("AUTH_REQUIRED", "Authorization bearer token is required", 401);
  };

  return {
    config,
    getClient,
    getFirebaseApiKey,
    getSessionCodec,
    loginRateLimit,
    requestRateLimit,
    socialWritesEnabled,
  };
}
