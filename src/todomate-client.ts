import type { Credentials } from "./config.ts";
import { TodomateError } from "./errors.ts";
import { FirebaseAuthSession } from "./firebase-auth.ts";
import type { JsonObject } from "./firestore.ts";
import { FirestoreRestClient } from "./firestore-client.ts";
import { fetchTransport, type HttpTransport } from "./http.ts";
import {
  compareNestedNumberField,
  compareNumberField,
  dateToTodomateDate,
  randomId,
  yyyymmddToTodomateDate,
} from "./record-utils.ts";
import type {
  ChatMessageInput,
  CreateTodoInput,
  ReminderInput,
  SetTodoDoneInput,
} from "./schemas.ts";
import type { TodomateApi, TodomateRecord } from "./todomate-api.ts";

export type { TodomateApi, TodomateRecord } from "./todomate-api.ts";

type TodomateClientOptions = {
  readonly clock?: () => number;
  readonly firebaseApiKey: string;
  readonly idGenerator?: () => string;
  readonly socialWritesEnabled?: boolean;
  readonly transport?: HttpTransport;
} & (
  | { readonly credentials: Credentials; readonly refreshToken?: never }
  | { readonly credentials?: never; readonly refreshToken: string }
);

type RefreshTokenClientOptions = {
  readonly clock?: () => number;
  readonly firebaseApiKey: string;
  readonly idGenerator?: () => string;
  readonly refreshToken: string;
  readonly socialWritesEnabled?: boolean;
  readonly transport?: HttpTransport;
};

export class TodomateClient implements TodomateApi {
  private readonly auth: FirebaseAuthSession;
  private readonly clock: () => number;
  private readonly db: FirestoreRestClient;
  private readonly idGenerator: () => string;
  private readonly socialWritesEnabled: boolean;

  constructor(options: TodomateClientOptions) {
    const transport = options.transport ?? fetchTransport;
    this.clock = options.clock ?? Date.now;
    this.auth =
      options.credentials !== undefined
        ? new FirebaseAuthSession({
            apiKey: options.firebaseApiKey,
            clock: this.clock,
            credentials: options.credentials,
            transport,
          })
        : new FirebaseAuthSession({
            apiKey: options.firebaseApiKey,
            clock: this.clock,
            refreshToken: options.refreshToken,
            transport,
          });
    this.db = new FirestoreRestClient(this.auth, transport);
    this.idGenerator = options.idGenerator ?? randomId;
    this.socialWritesEnabled = options.socialWritesEnabled ?? false;
  }

  static fromRefreshToken(options: RefreshTokenClientOptions): TodomateClient {
    return new TodomateClient(options);
  }

  async sessionSnapshot(): Promise<{ readonly refreshToken: string; readonly uid: string }> {
    return this.auth.snapshot();
  }

  async me(): Promise<TodomateRecord> {
    const uid = await this.auth.userId();
    const [profile, userData] = await Promise.all([
      this.db.getDocument(`User/${uid}`),
      this.db.getDocument(`UserData/${uid}`),
    ]);
    return { ...profile, userData };
  }

  async goals(): Promise<readonly TodomateRecord[]> {
    const uid = await this.auth.userId();
    const goals = await this.db.query("Goal", [{ fieldPath: "userID", op: "EQUAL", value: uid }]);
    return [...goals].sort(compareNumberField("priority", "asc"));
  }

  async todos(date: number): Promise<readonly TodomateRecord[]> {
    const uid = await this.auth.userId();
    const todos = await this.db.query("TodoItem", [
      { fieldPath: "writerID", op: "EQUAL", value: uid },
      { fieldPath: "date", op: "EQUAL", value: yyyymmddToTodomateDate(date) },
    ]);
    return [...todos].sort(compareNumberField("createTime", "asc"));
  }

  async createTodo(input: CreateTodoInput): Promise<TodomateRecord> {
    const uid = await this.auth.userId();
    const id = `${uid}${this.idGenerator()}`;
    const now = this.clock();

    return this.db.patchDocument(`TodoItem/${id}`, {
      content: input.content,
      createTime: now,
      date:
        input.date === undefined
          ? dateToTodomateDate(new Date(now))
          : yyyymmddToTodomateDate(input.date),
      doneTime: null,
      goalID: input.goalId,
      hasPhoto: false,
      hasTimer: false,
      id,
      isDone: false,
      isMemoPublic: false,
      likes: null,
      likesTotalCount: 0,
      likesTotalSenderIDs: null,
      memo: null,
      photoURL: null,
      remindAt: input.remindAt ?? null,
      routineID: null,
      spentTime: null,
      timer: null,
      writerID: uid,
    });
  }

  async setTodoDone(id: string, input: SetTodoDoneInput): Promise<TodomateRecord> {
    if (input.done) {
      const update: JsonObject = {
        doneTime: this.clock(),
        hasTimer: false,
        isDone: true,
        timer: null,
      };
      if (input.spentTime !== undefined) {
        return this.db.patchDocument(`TodoItem/${id}`, { ...update, spentTime: input.spentTime }, [
          "doneTime",
          "hasTimer",
          "isDone",
          "spentTime",
          "timer",
        ]);
      }
      return this.db.patchDocument(`TodoItem/${id}`, update, [
        "doneTime",
        "hasTimer",
        "isDone",
        "timer",
      ]);
    }

    return this.db.patchDocument(`TodoItem/${id}`, { isDone: false }, ["isDone"]);
  }

  async deleteTodo(id: string): Promise<void> {
    await this.db.deleteDocument(`TodoItem/${id}`);
  }

  async reminders(): Promise<readonly TodomateRecord[]> {
    const uid = await this.auth.userId();
    const reminders = await this.db.query("Reminder", [
      { fieldPath: "userID", op: "EQUAL", value: uid },
    ]);
    return [...reminders].sort(compareNumberField("time", "asc"));
  }

  async createReminder(input: ReminderInput): Promise<TodomateRecord> {
    const uid = await this.auth.userId();
    const id = this.idGenerator();
    return this.db.patchDocument(`Reminder/${id}`, {
      createTime: this.clock(),
      id,
      time: input.time,
      userID: uid,
    });
  }

  async updateReminder(id: string, input: ReminderInput): Promise<TodomateRecord> {
    return this.db.patchDocument(`Reminder/${id}`, { time: input.time }, ["time"]);
  }

  async deleteReminder(id: string): Promise<void> {
    await this.db.deleteDocument(`Reminder/${id}`);
  }

  async chatRooms(): Promise<readonly TodomateRecord[]> {
    const uid = await this.auth.userId();
    const rooms = await this.db.query("ChatRoom", [
      { fieldPath: "participantIds", op: "ARRAY_CONTAINS", value: uid },
    ]);
    return [...rooms].sort(compareNestedNumberField(["latestChatMessage", "createTime"], "desc"));
  }

  async chatMessages(
    roomId: string,
    options?: { readonly limit?: number },
  ): Promise<readonly TodomateRecord[]> {
    const messages = await this.db.query("ChatMessage", [
      { fieldPath: "chatRoomId", op: "EQUAL", value: roomId },
    ]);
    const limit = options?.limit ?? 50;
    return [...messages].sort(compareNumberField("createTime", "desc")).slice(0, limit);
  }

  async sendChatMessage(roomId: string, input: ChatMessageInput): Promise<TodomateRecord> {
    if (!this.socialWritesEnabled) {
      throw new TodomateError(
        "SOCIAL_WRITES_DISABLED",
        "DM writes are disabled by configuration",
        403,
      );
    }

    const uid = await this.auth.userId();
    const now = this.clock();
    const id = `${uid}${this.idGenerator()}`;
    const message: JsonObject = {
      chatRoomId: roomId,
      content: input.content,
      createTime: now,
      id,
      messageType: "plain",
      metaData: null,
      processedContent: input.content,
      senderId: uid,
      senderProfileImagePath: null,
      userContent: null,
    };
    const created = await this.db.patchDocument(`ChatMessage/${id}`, message);
    await this.db.patchDocument(`ChatRoom/${roomId}`, { latestChatMessage: message }, [
      "latestChatMessage",
    ]);
    return created;
  }
}
