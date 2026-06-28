import type { JsonObject } from "./firestore.ts";
import type {
  ChatMessageInput,
  CreateTodoInput,
  ReminderInput,
  SetTodoDoneInput,
  UpdateTodoInput,
} from "./schemas.ts";

export type TodomateRecord = JsonObject;

export type TodomateApi = {
  readonly chatMessages: (
    roomId: string,
    options?: { readonly limit?: number },
  ) => Promise<readonly TodomateRecord[]>;
  readonly chatRooms: () => Promise<readonly TodomateRecord[]>;
  readonly createReminder: (input: ReminderInput) => Promise<TodomateRecord>;
  readonly createTodo: (input: CreateTodoInput) => Promise<TodomateRecord>;
  readonly deleteReminder: (id: string) => Promise<void>;
  readonly deleteTodo: (id: string) => Promise<void>;
  readonly goals: () => Promise<readonly TodomateRecord[]>;
  readonly me: () => Promise<TodomateRecord>;
  readonly reminders: () => Promise<readonly TodomateRecord[]>;
  readonly sendChatMessage: (roomId: string, input: ChatMessageInput) => Promise<TodomateRecord>;
  readonly setTodoDone: (id: string, input: SetTodoDoneInput) => Promise<TodomateRecord>;
  readonly todos: (date: number) => Promise<readonly TodomateRecord[]>;
  readonly updateReminder: (id: string, input: ReminderInput) => Promise<TodomateRecord>;
  readonly updateTodo: (id: string, input: UpdateTodoInput) => Promise<TodomateRecord>;
  readonly userTodos: (userId: string, date: number) => Promise<readonly TodomateRecord[]>;
};
