import "reflect-metadata";
import type { IncomingMessage, ServerResponse } from "node:http";
import { buffer } from "node:stream/consumers";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { loadRuntimeConfig } from "./config.ts";
import { runtimeEnv } from "./runtime-env.ts";
import { createApp } from "./server.ts";

@Module({})
class TodomateApiModule {}

async function bootstrap(): Promise<void> {
  const env = runtimeEnv();
  const config = loadRuntimeConfig(env);
  const hono = createApp({ env });
  const nest = await NestFactory.create(TodomateApiModule, {
    bodyParser: false,
    logger: ["error", "warn", "log"],
  });

  nest.use(async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const response = await hono.fetch(await toFetchRequest(req));
    await writeFetchResponse(res, response);
  });

  await nest.listen(config.port, "0.0.0.0");
}

async function toFetchRequest(req: IncomingMessage): Promise<Request> {
  const method = req.method ?? "GET";
  const headers = requestHeaders(req);
  headers.set("x-todomate-remote-address", req.socket.remoteAddress ?? "runtime:unknown");
  return new Request(requestUrl(req), {
    body: method === "GET" || method === "HEAD" ? undefined : await requestBody(req),
    headers,
    method,
  });
}

async function requestBody(req: IncomingMessage): Promise<Buffer | undefined> {
  const body = await buffer(req);
  return body.length === 0 ? undefined : body;
}

function requestHeaders(req: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item);
      }
      continue;
    }
    headers.set(key, value);
  }
  return headers;
}

function requestUrl(req: IncomingMessage): string {
  const host = headerValue(req.headers.host) ?? "127.0.0.1";
  const proto = headerValue(req.headers["x-forwarded-proto"]) ?? "http";
  return `${proto}://${host}${req.url ?? "/"}`;
}

function headerValue(value: string | readonly string[] | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  return value[0] ?? null;
}

async function writeFetchResponse(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  res.end(Buffer.from(await response.arrayBuffer()));
}

bootstrap().catch((error: unknown) => {
  if (error instanceof Error) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
});
