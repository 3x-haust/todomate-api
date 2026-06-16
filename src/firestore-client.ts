import { firebaseConfig } from "./config.ts";
import { responseError } from "./errors.ts";
import type { FirebaseAuthSession } from "./firebase-auth.ts";
import {
  buildStructuredQuery,
  decodeDocument,
  encodeDocumentFields,
  type FirestoreDocument,
  type JsonObject,
  type QueryFilter,
} from "./firestore.ts";
import { fetchTransport, type HttpTransport } from "./http.ts";

type RunQueryRow = {
  readonly document?: FirestoreDocument;
};

export class FirestoreRestClient {
  private readonly auth: FirebaseAuthSession;
  private readonly transport: HttpTransport;

  constructor(auth: FirebaseAuthSession, transport: HttpTransport = fetchTransport) {
    this.auth = auth;
    this.transport = transport;
  }

  async getDocument(path: string): Promise<JsonObject> {
    const response = await this.transport({
      headers: await this.headers(),
      method: "GET",
      url: this.documentUrl(path),
    });

    if (!response.ok) {
      throw responseError("FIRESTORE_GET_FAILED", `Failed to read ${path}`, response.status);
    }

    return decodeDocument(parseDocument(await response.json()));
  }

  async patchDocument(
    path: string,
    value: JsonObject,
    updateMaskFields?: readonly string[],
  ): Promise<JsonObject> {
    const response = await this.transport({
      headers: await this.headers(),
      json: { fields: encodeDocumentFields(value) },
      method: "PATCH",
      url: this.maskedUrl(this.documentUrl(path), updateMaskFields),
    });

    if (!response.ok) {
      throw responseError("FIRESTORE_PATCH_FAILED", `Failed to write ${path}`, response.status);
    }

    return decodeDocument(parseDocument(await response.json()));
  }

  async deleteDocument(path: string): Promise<void> {
    const response = await this.transport({
      headers: await this.headers(),
      method: "DELETE",
      url: this.documentUrl(path),
    });

    if (!response.ok) {
      throw responseError("FIRESTORE_DELETE_FAILED", `Failed to delete ${path}`, response.status);
    }
  }

  async query(
    collectionId: string,
    filters: readonly QueryFilter[],
    limit?: number,
  ): Promise<readonly JsonObject[]> {
    const query =
      limit === undefined
        ? buildStructuredQuery({ collectionId, filters })
        : buildStructuredQuery({ collectionId, filters, limit });

    const response = await this.transport({
      headers: await this.headers(),
      json: query,
      method: "POST",
      url: `${this.baseUrl()}:runQuery`,
    });

    if (!response.ok) {
      throw responseError(
        "FIRESTORE_QUERY_FAILED",
        `Failed to query ${collectionId}`,
        response.status,
      );
    }

    return parseRunQueryRows(await response.json())
      .filter(hasDocument)
      .map((row) => decodeDocument(row.document));
  }

  private async headers(): Promise<Record<string, string>> {
    return { authorization: `Bearer ${await this.auth.idToken()}` };
  }

  private baseUrl(): string {
    return `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents`;
  }

  private documentUrl(path: string): string {
    return `${this.baseUrl()}/${path
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/")}`;
  }

  private maskedUrl(url: string, fields: readonly string[] | undefined): string {
    if (fields === undefined || fields.length === 0) {
      return url;
    }

    const parsed = new URL(url);
    for (const field of fields) {
      parsed.searchParams.append("updateMask.fieldPaths", field);
    }
    return parsed.toString();
  }
}

function hasDocument(row: RunQueryRow): row is { readonly document: FirestoreDocument } {
  return row.document !== undefined;
}

function parseDocument(value: unknown): FirestoreDocument {
  if (isDocument(value)) {
    return value;
  }
  throw new Error("Firestore document response is invalid");
}

function parseRunQueryRows(value: unknown): readonly RunQueryRow[] {
  if (!Array.isArray(value)) {
    throw new Error("Firestore query response is invalid");
  }
  return value.filter(isRunQueryRow);
}

function isDocument(value: unknown): value is FirestoreDocument {
  return (
    typeof value === "object" && value !== null && "name" in value && typeof value.name === "string"
  );
}

function isRunQueryRow(value: unknown): value is RunQueryRow {
  return typeof value === "object" && value !== null;
}
