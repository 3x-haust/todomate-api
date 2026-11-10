import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { firebaseConfig } from "../config.ts";
import { TodomateError } from "../errors.ts";
import { fetchTransport, type HttpTransport } from "../http.ts";
import { loginInputSchema } from "../schemas.ts";
import { TodomateClient } from "../todomate-client.ts";
import { help, parseOperation } from "./commands.ts";
import { loadSession, removeSession, saveSession } from "./session.ts";

type CliOptions = {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly readCredentials?: () => Promise<unknown>;
  readonly transport?: HttpTransport;
};

export async function runCli(args: readonly string[], options: CliOptions): Promise<unknown> {
  const [command] = args;
  if (command === undefined || command === "--help" || command === "help") return help;
  const directory = options.env.TODOMATE_CONFIG_DIR ?? join(homedir(), ".config", "todomate");
  const transport = options.transport ?? fetchTransport;
  if (command === "logout") {
    z.tuple([z.literal("logout")]).parse(args);
    await removeSession(directory);
    return { ok: true };
  }
  if (command === "login") {
    z.tuple([z.literal("login")]).parse(args);
    if (options.readCredentials === undefined) {
      throw new TodomateError("CREDENTIALS_REQUIRED", "Login requires email and password.", 400);
    }
    const credentials = loginInputSchema.parse(await options.readCredentials());
    const firebaseApiKey = await resolveFirebaseApiKey(options.env, transport);
    const client = new TodomateClient({ credentials, firebaseApiKey, transport });
    const session = await client.sessionSnapshot();
    await saveSession(directory, { ...session, firebaseApiKey });
    return { ok: true, uid: session.uid };
  }
  const operation = parseOperation(args);
  const stored = await loadSession(directory);
  const firebaseApiKey = options.env.TODOMATE_FIREBASE_API_KEY ?? stored.firebaseApiKey;
  const client = TodomateClient.fromRefreshToken({
    firebaseApiKey,
    refreshToken: stored.refreshToken,
    socialWritesEnabled: options.env.TODOMATE_ENABLE_SOCIAL_WRITES === "true",
    transport,
  });
  await saveSession(directory, { ...(await client.sessionSnapshot()), firebaseApiKey });
  const result = await operation(client);
  await saveSession(directory, { ...(await client.sessionSnapshot()), firebaseApiKey });
  return result;
}

async function resolveFirebaseApiKey(
  env: CliOptions["env"],
  transport: HttpTransport,
): Promise<string> {
  if (env.TODOMATE_FIREBASE_API_KEY) return env.TODOMATE_FIREBASE_API_KEY;
  const response = await transport({
    method: "GET",
    url: `https://${firebaseConfig.authDomain}/__/firebase/init.json`,
  });
  if (!response.ok) {
    throw new TodomateError(
      "FIREBASE_CONFIG_FAILED",
      "Cannot load Todomate public config. Set TODOMATE_FIREBASE_API_KEY explicitly.",
      502,
    );
  }
  return z
    .object({
      apiKey: z.string().min(1),
      projectId: z.literal(firebaseConfig.projectId),
    })
    .parse(await response.json()).apiKey;
}
