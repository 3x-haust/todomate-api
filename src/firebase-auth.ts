import { z } from "zod";
import type { Credentials } from "./config.ts";
import { responseError, TodomateError } from "./errors.ts";
import { fetchTransport, type HttpTransport } from "./http.ts";

type AuthSessionOptions = {
  readonly apiKey: string;
  readonly clock?: () => number;
  readonly credentials?: Credentials;
  readonly refreshToken?: string;
  readonly transport?: HttpTransport;
};

export type AuthSessionSnapshot = {
  readonly refreshToken: string;
  readonly uid: string;
};

type TokenState = {
  readonly expiresAt: number;
  readonly idToken: string;
  readonly refreshToken: string;
  readonly uid: string;
};

type AuthSource =
  | { readonly credentials: Credentials; readonly kind: "credentials" }
  | { readonly kind: "refreshToken"; readonly refreshToken: string };

const signInSchema = z.object({
  expiresIn: z.string(),
  idToken: z.string(),
  localId: z.string(),
  refreshToken: z.string(),
});

const refreshSchema = z.object({
  expires_in: z.string(),
  id_token: z.string(),
  refresh_token: z.string(),
  user_id: z.string(),
});

export class FirebaseAuthSession {
  private readonly apiKey: string;
  private token: TokenState | undefined;
  private readonly clock: () => number;
  private readonly source: AuthSource;
  private readonly transport: HttpTransport;

  constructor(options: AuthSessionOptions) {
    this.apiKey = options.apiKey;
    this.clock = options.clock ?? Date.now;
    this.source = authSource(options);
    this.transport = options.transport ?? fetchTransport;
  }

  async idToken(): Promise<string> {
    return (await this.session()).idToken;
  }

  async userId(): Promise<string> {
    return (await this.session()).uid;
  }

  async snapshot(): Promise<AuthSessionSnapshot> {
    const session = await this.session();
    return {
      refreshToken: session.refreshToken,
      uid: session.uid,
    };
  }

  private async session(): Promise<TokenState> {
    if (this.token !== undefined && this.token.expiresAt - 60_000 > this.clock()) {
      return this.token;
    }

    if (this.token !== undefined) {
      this.token = await this.refresh(this.token.refreshToken);
      return this.token;
    }

    this.token =
      this.source.kind === "credentials"
        ? await this.signIn(this.source.credentials)
        : await this.refresh(this.source.refreshToken);
    return this.token;
  }

  private async signIn(credentials: Credentials): Promise<TokenState> {
    const response = await this.transport({
      json: {
        email: credentials.email,
        password: credentials.password,
        returnSecureToken: true,
      },
      method: "POST",
      url: `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${this.apiKey}`,
    });

    if (!response.ok) {
      throw responseError("AUTH_FAILED", "Todomate login failed", 401);
    }

    const parsed = signInSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new TodomateError("AUTH_RESPONSE_INVALID", parsed.error.message, 502);
    }

    return {
      expiresAt: this.clock() + Number(parsed.data.expiresIn) * 1000,
      idToken: parsed.data.idToken,
      refreshToken: parsed.data.refreshToken,
      uid: parsed.data.localId,
    };
  }

  private async refresh(refreshToken: string): Promise<TokenState> {
    const response = await this.transport({
      json: {
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      },
      method: "POST",
      url: `https://securetoken.googleapis.com/v1/token?key=${this.apiKey}`,
    });

    if (!response.ok) {
      if (this.source.kind === "credentials") {
        return this.signIn(this.source.credentials);
      }
      throw responseError("AUTH_REFRESH_FAILED", "Todomate session refresh failed", 401);
    }

    const parsed = refreshSchema.safeParse(await response.json());
    if (!parsed.success) {
      if (this.source.kind === "credentials") {
        return this.signIn(this.source.credentials);
      }
      throw new TodomateError("AUTH_REFRESH_RESPONSE_INVALID", parsed.error.message, 502);
    }

    return {
      expiresAt: this.clock() + Number(parsed.data.expires_in) * 1000,
      idToken: parsed.data.id_token,
      refreshToken: parsed.data.refresh_token,
      uid: parsed.data.user_id,
    };
  }
}

function authSource(options: AuthSessionOptions): AuthSource {
  if (options.credentials !== undefined) {
    return { credentials: options.credentials, kind: "credentials" };
  }
  if (options.refreshToken !== undefined) {
    return { kind: "refreshToken", refreshToken: options.refreshToken };
  }
  throw new TodomateError(
    "AUTH_SOURCE_MISSING",
    "Todomate credentials or refresh token is required",
    500,
  );
}
