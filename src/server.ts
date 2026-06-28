import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { z } from "zod";
import { loadRuntimeConfig } from "./config.ts";
import { TodomateError } from "./errors.ts";
import { runtimeEnv } from "./runtime-env.ts";
import {
  chatMessageInputSchema,
  chatMessagesQuerySchema,
  createTodoInputSchema,
  reminderInputSchema,
  setTodoDoneInputSchema,
  updateTodoInputSchema,
  yyyymmddSchema,
} from "./schemas.ts";
import { registerAuthRoutes } from "./server/auth-routes.ts";
import { type CreateAppOptions, createServerContext } from "./server/context.ts";
import { httpStatus, requestJson, validationError } from "./server/http-helpers.ts";

export function createApp(options: CreateAppOptions = {}): Hono {
  const app = new Hono();
  const server = createServerContext(options);

  app.use("*", secureHeaders());
  app.use(
    "*",
    cors({
      allowHeaders: ["authorization", "content-type"],
      allowMethods: ["DELETE", "GET", "PATCH", "POST", "OPTIONS"],
      origin: server.config.corsOrigin,
    }),
  );

  app.onError((error, c) => {
    if (error instanceof TodomateError) {
      return c.json(
        { error: { code: error.code, message: error.message } },
        httpStatus(error.status),
      );
    }
    return c.json({ error: { code: "INTERNAL_ERROR", message: error.message } }, 500);
  });

  app.get("/health", (c) =>
    c.json({
      mode: "api",
      name: "todomate-api",
      ok: true,
    }),
  );

  registerAuthRoutes(app, server);

  app.get("/me", async (c): Promise<Response> => c.json(await (await server.getClient(c)).me()));

  app.get(
    "/goals",
    async (c): Promise<Response> => c.json(await (await server.getClient(c)).goals()),
  );

  app.get("/todos", async (c): Promise<Response> => {
    const parsed = z.object({ date: yyyymmddSchema }).safeParse(c.req.query());
    if (!parsed.success) {
      return validationError(c, parsed.error);
    }
    return c.json(await (await server.getClient(c)).todos(parsed.data.date));
  });

  app.get("/users/by-name/:name/todos", async (c): Promise<Response> => {
    const parsed = z
      .object({ date: yyyymmddSchema, name: z.string().min(1) })
      .safeParse({ ...c.req.query(), name: c.req.param("name") });
    if (!parsed.success) {
      return validationError(c, parsed.error);
    }
    return c.json(
      await (await server.getClient(c)).userTodosByName(parsed.data.name, parsed.data.date),
    );
  });

  app.get("/users/:userId/todos", async (c): Promise<Response> => {
    const parsed = z
      .object({ date: yyyymmddSchema, userId: z.string().min(1) })
      .safeParse({ ...c.req.query(), userId: c.req.param("userId") });
    if (!parsed.success) {
      return validationError(c, parsed.error);
    }
    return c.json(
      await (await server.getClient(c)).userTodos(parsed.data.userId, parsed.data.date),
    );
  });

  app.post("/todos", async (c): Promise<Response> => {
    const parsed = createTodoInputSchema.safeParse(await requestJson(c));
    if (!parsed.success) {
      return validationError(c, parsed.error);
    }
    return c.json(await (await server.getClient(c)).createTodo(parsed.data), 201);
  });

  app.patch("/todos/:id", async (c): Promise<Response> => {
    const parsed = updateTodoInputSchema.safeParse(await requestJson(c));
    if (!parsed.success) {
      return validationError(c, parsed.error);
    }
    return c.json(await (await server.getClient(c)).updateTodo(c.req.param("id"), parsed.data));
  });

  app.patch("/todos/:id/complete", async (c): Promise<Response> => {
    const parsed = setTodoDoneInputSchema.safeParse(await requestJson(c));
    if (!parsed.success) {
      return validationError(c, parsed.error);
    }
    return c.json(await (await server.getClient(c)).setTodoDone(c.req.param("id"), parsed.data));
  });

  app.delete("/todos/:id", async (c): Promise<Response> => {
    await (await server.getClient(c)).deleteTodo(c.req.param("id"));
    return c.body(null, 204);
  });

  app.get(
    "/reminders",
    async (c): Promise<Response> => c.json(await (await server.getClient(c)).reminders()),
  );

  app.post("/reminders", async (c): Promise<Response> => {
    const parsed = reminderInputSchema.safeParse(await requestJson(c));
    if (!parsed.success) {
      return validationError(c, parsed.error);
    }
    return c.json(await (await server.getClient(c)).createReminder(parsed.data), 201);
  });

  app.patch("/reminders/:id", async (c): Promise<Response> => {
    const parsed = reminderInputSchema.safeParse(await requestJson(c));
    if (!parsed.success) {
      return validationError(c, parsed.error);
    }
    return c.json(await (await server.getClient(c)).updateReminder(c.req.param("id"), parsed.data));
  });

  app.delete("/reminders/:id", async (c): Promise<Response> => {
    await (await server.getClient(c)).deleteReminder(c.req.param("id"));
    return c.body(null, 204);
  });

  app.get(
    "/chat/rooms",
    async (c): Promise<Response> => c.json(await (await server.getClient(c)).chatRooms()),
  );

  app.get("/chat/rooms/:roomId/messages", async (c): Promise<Response> => {
    const parsed = chatMessagesQuerySchema.safeParse(c.req.query());
    if (!parsed.success) {
      return validationError(c, parsed.error);
    }
    return c.json(
      await (await server.getClient(c)).chatMessages(c.req.param("roomId"), parsed.data),
    );
  });

  app.post("/chat/rooms/:roomId/messages", async (c): Promise<Response> => {
    if (!server.socialWritesEnabled) {
      return c.json(
        {
          error: {
            code: "SOCIAL_WRITES_DISABLED",
            message: "Set TODOMATE_ENABLE_SOCIAL_WRITES=true to enable DM writes.",
          },
        },
        403,
      );
    }

    const parsed = chatMessageInputSchema.safeParse(await requestJson(c));
    if (!parsed.success) {
      return validationError(c, parsed.error);
    }
    return c.json(
      await (await server.getClient(c)).sendChatMessage(c.req.param("roomId"), parsed.data),
      201,
    );
  });

  return app;
}

if (import.meta.main) {
  const env = runtimeEnv();
  const config = loadRuntimeConfig(env);
  const app = createApp({
    env,
    socialWritesEnabled: config.socialWritesEnabled,
  });
  Bun.serve({ fetch: app.fetch, port: config.port });
  console.log(`todomate-api listening on http://127.0.0.1:${config.port}`);
}
