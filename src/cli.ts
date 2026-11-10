#!/usr/bin/env node
import { z } from "zod";
import { readCredentials } from "./cli/credentials.ts";
import { runCli } from "./cli/run.ts";
import { TodomateError } from "./errors.ts";

try {
  const result = await runCli(process.argv.slice(2), { env: process.env, readCredentials });
  console.log(typeof result === "string" ? result : JSON.stringify(result, null, 2));
} catch (error) {
  const failure =
    error instanceof TodomateError
      ? { code: error.code, message: error.message }
      : error instanceof z.ZodError || error instanceof SyntaxError
        ? { code: "INPUT_INVALID", message: "Invalid input or response. Run todomate --help." }
        : {
            code: "CLI_FAILED",
            message: "Request failed. Check network and local session permissions.",
          };
  console.error(JSON.stringify({ error: failure }));
  process.exitCode = 1;
}
