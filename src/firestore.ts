export type JsonPrimitive = boolean | null | number | string;
export type JsonObject = { readonly [key: string]: JsonValue };
export type JsonValue = JsonObject | JsonPrimitive | readonly JsonValue[];

export type FirestoreValue =
  | { readonly arrayValue: { readonly values?: readonly FirestoreValue[] } }
  | { readonly booleanValue: boolean }
  | { readonly doubleValue: number }
  | { readonly integerValue: string }
  | { readonly mapValue: { readonly fields?: Readonly<Record<string, FirestoreValue>> } }
  | { readonly nullValue: null }
  | { readonly stringValue: string };

export type FirestoreDocument = {
  readonly fields?: Readonly<Record<string, FirestoreValue>>;
  readonly name: string;
};

export type QueryFilter = {
  readonly fieldPath: string;
  readonly op: "ARRAY_CONTAINS" | "EQUAL";
  readonly value: JsonValue;
};

export type StructuredQueryInput = {
  readonly collectionId: string;
  readonly filters?: readonly QueryFilter[];
  readonly limit?: number;
};

export function encodeFirestoreValue(value: JsonValue): FirestoreValue {
  if (value === null) {
    return { nullValue: null };
  }
  if (typeof value === "string") {
    return { stringValue: value };
  }
  if (typeof value === "boolean") {
    return { booleanValue: value };
  }
  if (typeof value === "number") {
    return Number.isInteger(value) ? { integerValue: value.toString() } : { doubleValue: value };
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(encodeFirestoreValue) } };
  }

  const fields: Record<string, FirestoreValue> = {};
  for (const [key, nested] of Object.entries(value)) {
    fields[key] = encodeFirestoreValue(nested);
  }
  return { mapValue: { fields } };
}

export function decodeFirestoreValue(value: FirestoreValue): JsonValue {
  if ("stringValue" in value) {
    return value.stringValue;
  }
  if ("integerValue" in value) {
    return Number(value.integerValue);
  }
  if ("doubleValue" in value) {
    return value.doubleValue;
  }
  if ("booleanValue" in value) {
    return value.booleanValue;
  }
  if ("nullValue" in value) {
    return null;
  }
  if ("arrayValue" in value) {
    return (value.arrayValue.values ?? []).map(decodeFirestoreValue);
  }

  const decoded: Record<string, JsonValue> = {};
  for (const [key, nested] of Object.entries(value.mapValue.fields ?? {})) {
    decoded[key] = decodeFirestoreValue(nested);
  }
  return decoded;
}

export function decodeDocument(document: FirestoreDocument): JsonObject {
  const decoded: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(document.fields ?? {})) {
    decoded[key] = decodeFirestoreValue(value);
  }

  if (typeof decoded.id === "string") {
    return decoded;
  }

  const fallbackId = document.name.split("/").at(-1);
  return fallbackId === undefined ? decoded : { id: fallbackId, ...decoded };
}

export function encodeDocumentFields(value: JsonObject): Readonly<Record<string, FirestoreValue>> {
  const fields: Record<string, FirestoreValue> = {};
  for (const [key, nested] of Object.entries(value)) {
    fields[key] = encodeFirestoreValue(nested);
  }
  return fields;
}

export function buildStructuredQuery(input: StructuredQueryInput): JsonObject {
  const structuredQuery: Record<string, JsonValue> = {
    from: [{ collectionId: input.collectionId }],
  };

  const where = buildWhere(input.filters ?? []);
  if (where !== undefined) {
    structuredQuery.where = where;
  }
  if (input.limit !== undefined) {
    structuredQuery.limit = input.limit;
  }

  return { structuredQuery };
}

function buildWhere(filters: readonly QueryFilter[]): JsonValue | undefined {
  if (filters.length === 0) {
    return undefined;
  }
  if (filters.length === 1) {
    const only = filters[0];
    return only === undefined ? undefined : buildFieldFilter(only);
  }

  return {
    compositeFilter: {
      filters: filters.map(buildFieldFilter),
      op: "AND",
    },
  };
}

function buildFieldFilter(filter: QueryFilter): JsonObject {
  return {
    fieldFilter: {
      field: { fieldPath: filter.fieldPath },
      op: filter.op,
      value: encodeFirestoreValue(filter.value),
    },
  };
}
