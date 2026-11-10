import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "../src/cli/run.ts";
import { createFakeTransport } from "./support/fake-transport.ts";

describe("local CLI", () => {
  test("logs in directly, persists rotated tokens, creates and completes todos, then logs out", async () => {
    // Given an isolated device and Firebase responses, without an API server.
    const directory = await mkdtemp(join(tmpdir(), "todomate-cli-"));
    const env = { TODOMATE_CONFIG_DIR: directory };
    const transport = createFakeTransport([
      {
        match: { method: "GET", urlIncludes: "/__/firebase/init.json" },
        body: { apiKey: "public-key", projectId: "mate-914f3" },
      },
      {
        match: { method: "POST", urlIncludes: "accounts:signInWithPassword" },
        body: { localId: "user", idToken: "id-1", refreshToken: "refresh-1", expiresIn: "3600" },
      },
      {
        match: { method: "POST", urlIncludes: "securetoken.googleapis.com" },
        body: { user_id: "user", id_token: "id-2", refresh_token: "refresh-2", expires_in: "3600" },
      },
      {
        match: { method: "PATCH", urlIncludes: "/TodoItem/" },
        body: {
          name: "projects/mate-914f3/databases/(default)/documents/TodoItem/todo-1",
          fields: { id: { stringValue: "todo-1" }, content: { stringValue: "test" } },
        },
      },
      {
        match: { method: "POST", urlIncludes: "securetoken.googleapis.com" },
        body: { user_id: "user", id_token: "id-3", refresh_token: "refresh-3", expires_in: "3600" },
      },
      {
        match: { method: "PATCH", urlIncludes: "/TodoItem/todo-1" },
        body: {
          name: "projects/mate-914f3/databases/(default)/documents/TodoItem/todo-1",
          fields: { id: { stringValue: "todo-1" }, isDone: { booleanValue: true } },
        },
      },
    ]);
    const options = {
      env,
      transport,
      readCredentials: async () => ({ email: "user@example.com", password: "private-password" }),
    };
    try {
      // When the user logs in and operates todos across separate invocations.
      expect(await runCli(["login"], options)).toEqual({ ok: true, uid: "user" });
      const path = join(directory, "session.json");
      expect((await stat(path)).mode & 0o777).toBe(0o600);
      expect((await stat(directory)).mode & 0o777).toBe(0o700);
      expect(await readFile(path, "utf8")).not.toContain("private-password");
      expect(
        await runCli(
          ["todo-create", '{"content":"test","goalId":"goal-1","date":20261110}'],
          options,
        ),
      ).toMatchObject({ id: "todo-1" });
      expect(JSON.parse(await readFile(path, "utf8")).refreshToken).toBe("refresh-2");
      expect(await runCli(["todo-complete", "todo-1"], options)).toMatchObject({ isDone: true });
      // Then only Todomate's Firebase services were contacted, using the rotated token.
      expect(transport.requests.map((request) => new URL(request.url).hostname)).toEqual([
        "mate-914f3.firebaseapp.com",
        "identitytoolkit.googleapis.com",
        "securetoken.googleapis.com",
        "firestore.googleapis.com",
        "securetoken.googleapis.com",
        "firestore.googleapis.com",
      ]);
      expect(transport.requests[4]?.json).toMatchObject({ refresh_token: "refresh-2" });
      expect(await runCli(["logout"], options)).toEqual({ ok: true });
      await expect(stat(path)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("rejects invalid commands before reading credentials or making requests", async () => {
    // Given no authentication or network fixtures.
    const transport = createFakeTransport([]);
    const options = { env: {}, transport };
    // When malformed requests are issued, then no network call is made.
    for (const args of [
      ["unknown"],
      ["todo-delete"],
      ["todos", "invalid"],
      ["todo-create", '{"content":"missing goal"}'],
      ["goals", "extra"],
      ["login", "password-in-argv"],
    ]) {
      await expect(runCli(args, options)).rejects.toBeDefined();
    }
    expect(transport.requests).toHaveLength(0);
    expect(await runCli(["--help"], options)).toBeString();
  });

  test("keeps the old session when login fails", async () => {
    // Given a valid existing session.
    const directory = await mkdtemp(join(tmpdir(), "todomate-cli-"));
    const transport = createFakeTransport([
      {
        match: { method: "POST", urlIncludes: "accounts:signInWithPassword" },
        body: { localId: "user", idToken: "id", refreshToken: "saved", expiresIn: "3600" },
      },
      {
        match: { method: "POST", urlIncludes: "accounts:signInWithPassword" },
        body: { error: "private upstream response" },
        status: 400,
      },
    ]);
    const options = {
      env: { TODOMATE_CONFIG_DIR: directory, TODOMATE_FIREBASE_API_KEY: "public-key" },
      transport,
      readCredentials: async () => ({ email: "user@example.com", password: "secret" }),
    };
    try {
      await runCli(["login"], options);
      const before = await readFile(join(directory, "session.json"), "utf8");
      // When a subsequent login fails, then the previous session remains intact.
      await expect(runCli(["login"], options)).rejects.toMatchObject({ code: "AUTH_FAILED" });
      expect(await readFile(join(directory, "session.json"), "utf8")).toBe(before);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("returns structured errors without leaking stdin credentials in the real process", async () => {
    const directory = await mkdtemp(join(tmpdir(), "todomate-cli-"));
    try {
      const process = Bun.spawn(
        [
          Bun.which("bun") ?? "bun",
          "run",
          new URL("../src/cli.ts", import.meta.url).pathname,
          "login",
        ],
        {
          env: { ...Bun.env, TODOMATE_CONFIG_DIR: directory },
          stdin: new Blob(['{"email":"invalid","password":"never-print-this"}']),
          stdout: "pipe",
          stderr: "pipe",
        },
      );
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(process.stdout).text(),
        new Response(process.stderr).text(),
        process.exited,
      ]);
      expect(exitCode).toBe(1);
      expect(stdout).toBe("");
      expect(JSON.parse(stderr).error.code).toBe("INPUT_INVALID");
      expect(stderr).not.toContain("never-print-this");
      await expect(stat(join(directory, "session.json"))).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("saves a rotated token even when the following Firestore request fails", async () => {
    const directory = await mkdtemp(join(tmpdir(), "todomate-cli-"));
    const transport = createFakeTransport([
      {
        match: { method: "POST", urlIncludes: "accounts:signInWithPassword" },
        body: { localId: "user", idToken: "id", refreshToken: "old", expiresIn: "3600" },
      },
      {
        match: { method: "POST", urlIncludes: "securetoken.googleapis.com" },
        body: { user_id: "user", id_token: "id-2", refresh_token: "rotated", expires_in: "3600" },
      },
      {
        match: { method: "POST", urlIncludes: "/documents:runQuery" },
        body: {},
        status: 403,
      },
    ]);
    const options = {
      env: { TODOMATE_CONFIG_DIR: directory, TODOMATE_FIREBASE_API_KEY: "public-key" },
      transport,
      readCredentials: async () => ({ email: "user@example.com", password: "secret" }),
    };
    try {
      await runCli(["login"], options);
      await expect(runCli(["goals"], options)).rejects.toBeDefined();
      const session = JSON.parse(await readFile(join(directory, "session.json"), "utf8"));
      expect(session.refreshToken).toBe("rotated");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
