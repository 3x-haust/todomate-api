import { describe, expect, test } from "bun:test";
import { FixedWindowRateLimit } from "../src/rate-limit.ts";
import { createApp } from "../src/server.ts";
import { SessionCodec } from "../src/session-codec.ts";
import type { TodomateApi } from "../src/todomate-client.ts";

const testSessionKey = "a".repeat(64);

const fakeClient: TodomateApi = {
  chatMessages: async () => [],
  chatRooms: async () => [],
  createReminder: async (input) => ({ id: "reminder-1", time: input.time }),
  createTodo: async (input) => ({
    content: input.content,
    date: input.date ?? 20260617,
    goalId: input.goalId,
    id: "todo-1",
    isDone: false,
  }),
  deleteReminder: async () => undefined,
  deleteTodo: async () => undefined,
  goals: async () => [{ id: "goal-1", priority: 1, title: "Inbox", userID: "uid-1" }],
  me: async () => ({ id: "uid-1", name: "User" }),
  reminders: async () => [],
  sendChatMessage: async () => {
    throw new Error("social writes are disabled");
  },
  setTodoDone: async (id, input) => ({ id, isDone: input.done, doneTime: 123 }),
  todos: async () => [],
  updateReminder: async (id, input) => ({ id, time: input.time }),
};

describe("HTTP API", () => {
  test("validates todo date query parameters", async () => {
    const app = createApp({ client: fakeClient });

    const response = await app.request("/todos?date=not-a-date");

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
  });

  test("creates todos through the injected client", async () => {
    const app = createApp({ client: fakeClient });

    const response = await app.request("/todos", {
      body: JSON.stringify({ content: "from http", date: 20260617, goalId: "goal-1" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      id: "todo-1",
      content: "from http",
      date: 20260617,
      goalId: "goal-1",
      isDone: false,
    });
  });

  test("keeps DM sending disabled unless explicitly enabled", async () => {
    const app = createApp({ client: fakeClient, socialWritesEnabled: false });

    const response = await app.request("/chat/rooms/room-1/messages", {
      body: JSON.stringify({ content: "hello" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "SOCIAL_WRITES_DISABLED" },
    });
  });

  test("requires a bearer session in API-only mode", async () => {
    const app = createApp({ env: { SESSION_ENCRYPTION_KEY: testSessionKey } });

    const response = await app.request("/goals");

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "AUTH_REQUIRED" },
    });
  });

  test("ignores Todomate credential env and stays API-only", async () => {
    const app = createApp({
      env: {
        SESSION_ENCRYPTION_KEY: testSessionKey,
        TODOMATE_EMAIL: "user@example.com",
        TODOMATE_PASSWORD: "secret",
      },
    });

    const response = await app.request("/health");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      mode: "api",
      ok: true,
    });
  });

  test("uses bearer session token to create a per-user client", async () => {
    const codec = new SessionCodec({
      key: testSessionKey,
      now: () => 1_800_000_000_000,
    });
    const token = codec.encode({
      expiresAt: 1_800_086_400_000,
      issuedAt: 1_800_000_000_000,
      refreshToken: "refresh-1",
      uid: "uid-1",
    });
    const app = createApp({
      clientFactory: async (session) => ({
        ...fakeClient,
        goals: async () => [{ id: "goal-1", refreshToken: session.refreshToken }],
      }),
      env: {},
      sessionCodec: codec,
    });

    const response = await app.request("/goals", {
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([{ id: "goal-1", refreshToken: "refresh-1" }]);
  });

  test("fails fast when API server mode is missing a session encryption key", () => {
    expect(() => createApp({ env: {} })).toThrow("SESSION_ENCRYPTION_KEY is required");
  });

  test("requires the Firebase API key env before live login", async () => {
    const app = createApp({ env: { SESSION_ENCRYPTION_KEY: testSessionKey } });

    const response = await app.request("/auth/login", {
      body: JSON.stringify({ email: "user@example.com", password: "secret" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "FIREBASE_API_KEY_MISSING" },
    });
  });

  test("does not trust spoofed x-forwarded-for when rate limiting login", async () => {
    const app = createApp({
      env: { SESSION_ENCRYPTION_KEY: testSessionKey },
      loginRateLimit: new FixedWindowRateLimit({
        limit: 1,
        now: () => 1_800_000_000_000,
        windowMs: 60_000,
      }),
    });

    const first = await app.request("/auth/login", {
      body: JSON.stringify({ email: "not-an-email", password: "secret" }),
      headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.1" },
      method: "POST",
    });
    const second = await app.request("/auth/login", {
      body: JSON.stringify({ email: "not-an-email", password: "secret" }),
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.1" },
      method: "POST",
    });

    expect(first.status).toBe(400);
    expect(second.status).toBe(429);
  });

  test("rate limits authenticated API routes", async () => {
    const codec = new SessionCodec({
      key: testSessionKey,
      now: () => 1_800_000_000_000,
    });
    const token = codec.encode({
      expiresAt: 1_800_086_400_000,
      issuedAt: 1_800_000_000_000,
      refreshToken: "refresh-1",
      uid: "uid-1",
    });
    const app = createApp({
      clientFactory: async () => fakeClient,
      env: {},
      requestRateLimit: new FixedWindowRateLimit({
        limit: 1,
        now: () => 1_800_000_000_000,
        windowMs: 60_000,
      }),
      sessionCodec: codec,
    });

    const first = await app.request("/goals", {
      headers: { authorization: `Bearer ${token}` },
    });
    const second = await app.request("/goals", {
      headers: { authorization: `Bearer ${token}` },
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
  });
});
