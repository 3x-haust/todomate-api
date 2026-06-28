import type { JsonObject, JsonValue } from "./firestore.ts";
import type { FirestoreRestClient } from "./firestore-client.ts";
import { compareNumberField, yyyymmddToTodomateDate } from "./record-utils.ts";
import type { TodomateFriends, TodomateRecord, TodomateUserTodos } from "./todomate-api.ts";

export async function readMe(db: FirestoreRestClient, uid: string): Promise<TodomateRecord> {
  const [profile, userData] = await Promise.all([
    db.getDocument(`User/${uid}`),
    db.getDocument(`UserData/${uid}`),
  ]);
  return { ...profile, userData };
}

export async function readFriends(db: FirestoreRestClient, uid: string): Promise<TodomateFriends> {
  const userData = await db.getDocument(`UserData/${uid}`);
  const followingIds = stringArray(userData.followingIds);
  const followerIds = stringArray(userData.followerIds);
  const [following, followers] = await Promise.all([
    readUserProfiles(db, followingIds),
    readUserProfiles(db, followerIds),
  ]);
  return { followers, following };
}

export async function readTodosForWriter(
  db: FirestoreRestClient,
  writerId: string,
  date: number,
): Promise<readonly TodomateRecord[]> {
  const todos = await db.query("TodoItem", [
    { fieldPath: "writerID", op: "EQUAL", value: writerId },
    { fieldPath: "date", op: "EQUAL", value: yyyymmddToTodomateDate(date) },
  ]);
  return [...todos].sort(compareNumberField("createTime", "asc"));
}

export async function readUserTodosByName(
  db: FirestoreRestClient,
  name: string,
  date: number,
): Promise<readonly TodomateUserTodos[]> {
  const users = await db.query("User", [{ fieldPath: "name", op: "EQUAL", value: name }]);
  return Promise.all(
    users.map(async (user) => ({
      todos: await readTodosForWriter(db, String(user.id), date),
      user,
    })),
  );
}

async function readUserProfiles(
  db: FirestoreRestClient,
  ids: readonly string[],
): Promise<readonly JsonObject[]> {
  return Promise.all(ids.map((id) => db.getDocument(`User/${id}`)));
}

function stringArray(value: JsonValue | undefined): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}
