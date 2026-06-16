import ky from "ky";
import { TodomateError } from "./errors.ts";

export type HttpMethod = "DELETE" | "GET" | "PATCH" | "POST";

export type HttpRequest = {
  readonly headers?: Readonly<Record<string, string>>;
  readonly json?: unknown;
  readonly method: HttpMethod;
  readonly url: string;
};

export type HttpResponse = {
  readonly ok: boolean;
  readonly status: number;
  readonly json: () => Promise<unknown>;
  readonly text: () => Promise<string>;
};

export type HttpTransport = (request: HttpRequest) => Promise<HttpResponse>;

export const fetchTransport: HttpTransport = async (request) => {
  const response = await ky(request.url, kyOptions(request)).catch((error: unknown) => {
    if (error instanceof Error) {
      throw new TodomateError("UPSTREAM_REQUEST_FAILED", "Upstream request failed", 502);
    }
    throw error;
  });

  return {
    ok: response.ok,
    status: response.status,
    json: async () => response.json(),
    text: async () => response.text(),
  };
};

function kyOptions(request: HttpRequest): Parameters<typeof ky>[1] {
  return {
    headers: {
      ...request.headers,
    },
    json: request.json,
    method: request.method,
    retry: {
      limit: 2,
      methods: ["get", "post"],
      statusCodes: [408, 413, 429, 500, 502, 503, 504],
    },
    throwHttpErrors: false,
    timeout: 15_000,
  };
}
