import { z } from "zod";

export const firebaseConfig = {
  appId: "1:274121826895:web:b05334cd15db33ac21803a",
  authDomain: "mate-914f3.firebaseapp.com",
  projectId: "mate-914f3",
  storageBucket: "mate-914f3.appspot.com",
};

export type Credentials = {
  readonly email: string;
  readonly password: string;
};

export type RuntimeConfig = {
  readonly corsOrigin: string;
  readonly firebaseApiKey: string | null;
  readonly port: number;
  readonly sessionEncryptionKey: string | null;
  readonly sessionTtlMs: number;
  readonly socialWritesEnabled: boolean;
};

const envSchema = z.object({
  CORS_ORIGIN: z.string().default("*"),
  SESSION_ENCRYPTION_KEY: z
    .string()
    .regex(/^[a-fA-F0-9]{64}$/, "SESSION_ENCRYPTION_KEY must be 64 hex characters")
    .optional(),
  SESSION_TTL_DAYS: z.string().regex(/^\d+$/).default("30"),
  TODOMATE_ENABLE_SOCIAL_WRITES: z.enum(["false", "true"]).default("false"),
  TODOMATE_FIREBASE_API_KEY: z.string().min(1).optional(),
  TODOMATE_PORT: z.string().regex(/^\d+$/).default("3000"),
});

export function loadRuntimeConfig(
  env: Readonly<Record<string, string | undefined>>,
): RuntimeConfig {
  const parsed = envSchema.parse(env);

  return {
    corsOrigin: parsed.CORS_ORIGIN,
    firebaseApiKey: parsed.TODOMATE_FIREBASE_API_KEY ?? null,
    port: Number(parsed.TODOMATE_PORT),
    sessionEncryptionKey: parsed.SESSION_ENCRYPTION_KEY ?? null,
    sessionTtlMs: Number(parsed.SESSION_TTL_DAYS) * 86_400_000,
    socialWritesEnabled: parsed.TODOMATE_ENABLE_SOCIAL_WRITES === "true",
  };
}
