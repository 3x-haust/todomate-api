import type { Hono } from "hono";
import { loginInputSchema } from "../schemas.ts";
import { TodomateClient } from "../todomate-client.ts";
import type { AppContext } from "./context.ts";
import { loginRateLimitKey, requestJson, validationError } from "./http-helpers.ts";

export function registerAuthRoutes(app: Hono, server: AppContext): void {
  app.post("/auth/login", async (c): Promise<Response> => {
    server.getSessionCodec();
    if (!server.loginRateLimit.consume(loginRateLimitKey(c))) {
      return c.json(
        {
          error: {
            code: "RATE_LIMITED",
            message: "Too many login attempts. Try again later.",
          },
        },
        429,
      );
    }

    const parsed = loginInputSchema.safeParse(await requestJson(c));
    if (!parsed.success) {
      return validationError(c, parsed.error);
    }

    const client = new TodomateClient({
      credentials: parsed.data,
      firebaseApiKey: server.getFirebaseApiKey(),
      socialWritesEnabled: server.socialWritesEnabled,
    });
    const snapshot = await client.sessionSnapshot();
    const issuedAt = Date.now();
    const expiresAt = issuedAt + server.config.sessionTtlMs;

    return c.json({
      expiresAt,
      token: server.getSessionCodec().encode({
        expiresAt,
        issuedAt,
        refreshToken: snapshot.refreshToken,
        uid: snapshot.uid,
      }),
      tokenType: "Bearer",
      uid: snapshot.uid,
    });
  });

  app.post("/auth/logout", async (c): Promise<Response> => {
    await server.getClient(c);
    return c.json({ ok: true });
  });
}
