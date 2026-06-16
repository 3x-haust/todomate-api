export function runtimeEnv(): Readonly<Record<string, string | undefined>> {
  if (typeof Bun !== "undefined") {
    return Bun.env;
  }
  return process.env;
}
