import { stderr, stdin } from "node:process";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { TodomateError } from "../errors.ts";

export async function readCredentials(): Promise<unknown> {
  if (!stdin.isTTY) {
    stdin.setEncoding("utf8");
    let input = "";
    for await (const chunk of stdin) input += chunk;
    return JSON.parse(input);
  }
  let hidden = false;
  const output = new Writable({
    write(chunk, _encoding, callback) {
      if (!hidden) stderr.write(chunk);
      callback();
    },
  });
  const prompt = createInterface({ input: stdin, output, terminal: true });
  const cancelled = new AbortController();
  prompt.on("SIGINT", () => cancelled.abort());
  prompt.on("close", () => cancelled.abort());
  try {
    const email = await prompt.question("Todomate email: ", { signal: cancelled.signal });
    stderr.write("Todomate password: ");
    hidden = true;
    const password = await prompt.question("", { signal: cancelled.signal });
    return { email, password };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new TodomateError("LOGIN_CANCELLED", "Login cancelled.", 400);
    }
    throw error;
  } finally {
    prompt.close();
    stderr.write("\n");
  }
}
