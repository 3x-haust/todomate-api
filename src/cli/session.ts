import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { TodomateError } from "../errors.ts";

const sessionSchema = z.object({
  firebaseApiKey: z.string().min(1),
  refreshToken: z.string().min(1),
  uid: z.string().min(1),
});

type LocalSession = z.infer<typeof sessionSchema>;

export async function loadSession(directory: string): Promise<LocalSession> {
  try {
    return sessionSchema.parse(JSON.parse(await readFile(join(directory, "session.json"), "utf8")));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new TodomateError("LOGIN_REQUIRED", "Run todomate login first.", 401);
    }
    throw new TodomateError("SESSION_READ_FAILED", "Cannot read local session. Log in again.", 500);
  }
}

export async function saveSession(directory: string, session: LocalSession): Promise<void> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const temporary = join(directory, `.session-${randomUUID()}.json`);
  try {
    await writeFile(temporary, JSON.stringify(session), { mode: 0o600, flag: "wx" });
    await rename(temporary, join(directory, "session.json"));
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function removeSession(directory: string): Promise<void> {
  await rm(join(directory, "session.json"), { force: true });
}
