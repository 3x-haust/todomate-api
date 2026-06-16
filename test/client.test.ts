import { describe, expect, test } from "bun:test";
import { TodomateClient } from "../src/todomate-client.ts";
import { createFakeTransport } from "./support/fake-transport.ts";

const testFirebaseApiKey = "test-firebase-api-key";

describe("TodomateClient", () => {
  test("signs in with Firebase Auth and reads goals with client-side sorting", async () => {
    const transport = createFakeTransport([
      {
        match: { method: "POST", urlIncludes: "accounts:signInWithPassword" },
        body: {
          localId: "uid-1",
          idToken: "token-1",
          refreshToken: "refresh-1",
          expiresIn: "3600",
        },
      },
      {
        match: { method: "POST", urlIncludes: "/documents:runQuery" },
        body: [
          {
            document: {
              name: "projects/mate-914f3/databases/(default)/documents/Goal/goal-b",
              fields: {
                id: { stringValue: "goal-b" },
                userID: { stringValue: "uid-1" },
                title: { stringValue: "B" },
                priority: { integerValue: "20" },
              },
            },
          },
          {
            document: {
              name: "projects/mate-914f3/databases/(default)/documents/Goal/goal-a",
              fields: {
                id: { stringValue: "goal-a" },
                userID: { stringValue: "uid-1" },
                title: { stringValue: "A" },
                priority: { integerValue: "10" },
              },
            },
          },
        ],
      },
    ]);

    const client = new TodomateClient({
      credentials: { email: "user@example.com", password: "secret" },
      firebaseApiKey: testFirebaseApiKey,
      transport,
    });

    await expect(client.goals()).resolves.toEqual([
      { id: "goal-a", priority: 10, title: "A", userID: "uid-1" },
      { id: "goal-b", priority: 20, title: "B", userID: "uid-1" },
    ]);

    expect(transport.requests[0]?.json).toEqual({
      email: "user@example.com",
      password: "secret",
      returnSecureToken: true,
    });
    expect(JSON.stringify(transport.requests)).not.toContain("orderBy");
  });

  test("creates a Todomate-compatible todo id and completion update", async () => {
    const transport = createFakeTransport([
      {
        match: { method: "POST", urlIncludes: "accounts:signInWithPassword" },
        body: {
          localId: "uid-1",
          idToken: "token-1",
          refreshToken: "refresh-1",
          expiresIn: "3600",
        },
      },
      {
        match: { method: "PATCH", urlIncludes: "/TodoItem/uid-1auto-id" },
        body: {
          name: "projects/mate-914f3/databases/(default)/documents/TodoItem/uid-1auto-id",
          fields: {
            id: { stringValue: "uid-1auto-id" },
            writerID: { stringValue: "uid-1" },
            goalID: { stringValue: "goal-1" },
            content: { stringValue: "ship wrapper" },
            date: { integerValue: "20260617" },
            isDone: { booleanValue: false },
          },
        },
      },
      {
        match: { method: "PATCH", urlIncludes: "/TodoItem/uid-1auto-id" },
        body: {
          name: "projects/mate-914f3/databases/(default)/documents/TodoItem/uid-1auto-id",
          fields: {
            id: { stringValue: "uid-1auto-id" },
            isDone: { booleanValue: true },
            doneTime: { integerValue: "1800000000000" },
            hasTimer: { booleanValue: false },
          },
        },
      },
    ]);

    const client = new TodomateClient({
      clock: () => 1_800_000_000_000,
      credentials: { email: "user@example.com", password: "secret" },
      firebaseApiKey: testFirebaseApiKey,
      idGenerator: () => "auto-id",
      transport,
    });

    await expect(
      client.createTodo({ content: "ship wrapper", date: 20260617, goalId: "goal-1" }),
    ).resolves.toMatchObject({ id: "uid-1auto-id", isDone: false });
    await expect(client.setTodoDone("uid-1auto-id", { done: true })).resolves.toMatchObject({
      doneTime: 1_800_000_000_000,
      hasTimer: false,
      id: "uid-1auto-id",
      isDone: true,
    });
  });

  test("converts YYYYMMDD todo inputs to Todomate UTC-midnight dates", async () => {
    const transport = createFakeTransport([
      {
        match: { method: "POST", urlIncludes: "accounts:signInWithPassword" },
        body: {
          localId: "uid-1",
          idToken: "token-1",
          refreshToken: "refresh-1",
          expiresIn: "3600",
        },
      },
      {
        match: { method: "POST", urlIncludes: "/documents:runQuery" },
        body: [],
      },
      {
        match: { method: "PATCH", urlIncludes: "/TodoItem/uid-1auto-id" },
        body: {
          name: "projects/mate-914f3/databases/(default)/documents/TodoItem/uid-1auto-id",
          fields: {
            id: { stringValue: "uid-1auto-id" },
            date: { integerValue: "1781654400000" },
          },
        },
      },
    ]);
    const client = new TodomateClient({
      credentials: { email: "user@example.com", password: "secret" },
      firebaseApiKey: testFirebaseApiKey,
      idGenerator: () => "auto-id",
      transport,
    });

    await expect(client.todos(20260617)).resolves.toEqual([]);
    await expect(
      client.createTodo({ content: "ship wrapper", date: 20260617, goalId: "goal-1" }),
    ).resolves.toMatchObject({ date: 1_781_654_400_000 });

    expect(JSON.stringify(transport.requests[1]?.json)).toContain("1781654400000");
    expect(JSON.stringify(transport.requests[2]?.json)).toContain("1781654400000");
    expect(JSON.stringify(transport.requests.slice(1))).not.toContain("20260617");
  });

  test("uses a stored Firebase refresh token without seeing the Todomate password again", async () => {
    const transport = createFakeTransport([
      {
        match: { method: "POST", urlIncludes: "securetoken.googleapis.com" },
        body: {
          expires_in: "3600",
          id_token: "token-from-refresh",
          refresh_token: "next-refresh",
          user_id: "uid-1",
        },
      },
      {
        match: { method: "POST", urlIncludes: "/documents:runQuery" },
        body: [],
      },
    ]);

    const client = TodomateClient.fromRefreshToken({
      firebaseApiKey: testFirebaseApiKey,
      refreshToken: "stored-refresh",
      transport,
    });

    await expect(client.goals()).resolves.toEqual([]);
    expect(JSON.stringify(transport.requests)).not.toContain("password");
    expect(transport.requests[0]?.json).toEqual({
      grant_type: "refresh_token",
      refresh_token: "stored-refresh",
    });
  });
});
