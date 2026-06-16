import { describe, expect, test } from "bun:test";
import {
  buildStructuredQuery,
  decodeFirestoreValue,
  encodeFirestoreValue,
} from "../src/firestore.ts";

describe("Firestore REST value codec", () => {
  test("round-trips Todomate primitive and nested fields", () => {
    const encoded = encodeFirestoreValue({
      content: "write api",
      date: 20260617,
      isDone: false,
      remindAt: null,
      tags: ["api", 7],
      memo: { public: false },
    });

    expect(decodeFirestoreValue(encoded)).toEqual({
      content: "write api",
      date: 20260617,
      isDone: false,
      remindAt: null,
      tags: ["api", 7],
      memo: { public: false },
    });
  });

  test("builds unordered equality queries so Todomate's missing composite indexes do not break reads", () => {
    expect(
      buildStructuredQuery({
        collectionId: "TodoItem",
        filters: [
          { fieldPath: "writerID", op: "EQUAL", value: "uid-1" },
          { fieldPath: "date", op: "EQUAL", value: 20260617 },
        ],
      }),
    ).toEqual({
      structuredQuery: {
        from: [{ collectionId: "TodoItem" }],
        where: {
          compositeFilter: {
            filters: [
              {
                fieldFilter: {
                  field: { fieldPath: "writerID" },
                  op: "EQUAL",
                  value: { stringValue: "uid-1" },
                },
              },
              {
                fieldFilter: {
                  field: { fieldPath: "date" },
                  op: "EQUAL",
                  value: { integerValue: "20260617" },
                },
              },
            ],
            op: "AND",
          },
        },
      },
    });
  });
});
