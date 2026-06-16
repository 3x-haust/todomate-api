import type { JsonObject, JsonValue } from "./firestore.ts";
import type { TodomateRecord } from "./todomate-client.ts";

export function randomId(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length] ?? "A").join("");
}

export function dateToYyyymmdd(date: Date): number {
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  return Number(`${date.getFullYear()}${month}${day}`);
}

export function dateToTodomateDate(date: Date): number {
  return yyyymmddToTodomateDate(dateToYyyymmdd(date));
}

export function yyyymmddToTodomateDate(value: number): number {
  const year = Math.trunc(value / 10_000);
  const month = Math.trunc((value % 10_000) / 100);
  const day = value % 100;
  return Date.UTC(year, month - 1, day);
}

export function compareNumberField(field: string, direction: "asc" | "desc") {
  return (left: TodomateRecord, right: TodomateRecord): number => {
    const diff = numberField(left, field) - numberField(right, field);
    return direction === "asc" ? diff : -diff;
  };
}

export function compareNestedNumberField(path: readonly string[], direction: "asc" | "desc") {
  return (left: TodomateRecord, right: TodomateRecord): number => {
    const diff = nestedNumberField(left, path) - nestedNumberField(right, path);
    return direction === "asc" ? diff : -diff;
  };
}

function numberField(record: TodomateRecord, field: string): number {
  const value = record[field];
  return typeof value === "number" ? value : 0;
}

function nestedNumberField(record: TodomateRecord, path: readonly string[]): number {
  let current: JsonValue = record;
  for (const segment of path) {
    if (!isJsonObject(current)) {
      return 0;
    }
    current = current[segment] ?? null;
  }
  return typeof current === "number" ? current : 0;
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
