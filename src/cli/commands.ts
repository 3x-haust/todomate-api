import { z } from "zod";
import { TodomateError } from "../errors.ts";
import {
  chatMessageInputSchema,
  chatMessagesQuerySchema,
  createTodoInputSchema,
  reminderInputSchema,
  setTodoDoneInputSchema,
  updateTodoInputSchema,
  yyyymmddSchema,
} from "../schemas.ts";
import type { TodomateApi } from "../todomate-api.ts";

export const help = `Usage: todomate <command> [arguments]

login                              Prompt for email/password, or read JSON from stdin
logout                             Remove the local session (does not revoke Firebase tokens)
me | friends | goals               Read account, friends or goals
todos YYYYMMDD                     Read your todos
user-todos USER_ID YYYYMMDD         Read visible user todos
user-todos-by-name NAME YYYYMMDD    Find visible todos by exact display name
todo-create JSON                   {"content":"...","goalId":"...","date":20261110}
todo-update ID JSON                {"content":"...","date":20261110}
todo-complete ID [JSON]             Default: {"done":true}; undo: {"done":false}
todo-delete ID                     Delete a todo
reminders                          Read reminders
reminder-create JSON               {"time":1800000000000}
reminder-update ID JSON             {"time":1800000000000}
reminder-delete ID                 Delete a reminder
chat-rooms                         Read chat rooms
chat-messages ROOM_ID [LIMIT]       Read messages (default: 50)
chat-send ROOM_ID JSON              {"content":"..."}; requires social writes enabled

All requests go directly to Todomate's Firebase services.
Results are JSON. Credentials and tokens are never printed.
TODOMATE_CONFIG_DIR overrides ~/.config/todomate.
TODOMATE_FIREBASE_API_KEY optionally overrides public config discovery.
TODOMATE_ENABLE_SOCIAL_WRITES=true enables chat-send.`;

const id = z.string().min(1);
const json = z.string().transform((text): unknown => JSON.parse(text));

export function parseOperation(args: readonly string[]): (client: TodomateApi) => Promise<unknown> {
  const [command, ...rest] = args;
  switch (command) {
    case "me":
    case "friends":
    case "goals":
    case "reminders":
    case "chat-rooms": {
      z.tuple([]).parse(rest);
      return (client) => (command === "chat-rooms" ? client.chatRooms() : client[command]());
    }
    case "todos": {
      const [date] = z.tuple([yyyymmddSchema]).parse(rest);
      return (client) => client.todos(date);
    }
    case "user-todos":
    case "user-todos-by-name": {
      const [user, date] = z.tuple([id, yyyymmddSchema]).parse(rest);
      return (client) =>
        command === "user-todos"
          ? client.userTodos(user, date)
          : client.userTodosByName(user, date);
    }
    case "todo-create": {
      const [input] = z.tuple([json.pipe(createTodoInputSchema)]).parse(rest);
      return (client) => client.createTodo(input);
    }
    case "todo-update": {
      const [todoId, input] = z.tuple([id, json.pipe(updateTodoInputSchema)]).parse(rest);
      return (client) => client.updateTodo(todoId, input);
    }
    case "todo-complete": {
      const [todoId, input] = z
        .tuple([id, json.pipe(setTodoDoneInputSchema).optional()])
        .parse(rest);
      return (client) => client.setTodoDone(todoId, input ?? { done: true });
    }
    case "todo-delete":
    case "reminder-delete": {
      const [recordId] = z.tuple([id]).parse(rest);
      return async (client) => {
        if (command === "todo-delete") await client.deleteTodo(recordId);
        else await client.deleteReminder(recordId);
        return { ok: true };
      };
    }
    case "reminder-create": {
      const [input] = z.tuple([json.pipe(reminderInputSchema)]).parse(rest);
      return (client) => client.createReminder(input);
    }
    case "reminder-update": {
      const [reminderId, input] = z.tuple([id, json.pipe(reminderInputSchema)]).parse(rest);
      return (client) => client.updateReminder(reminderId, input);
    }
    case "chat-messages": {
      const [roomId, limit] = z.tuple([id, z.string().optional()]).parse(rest);
      const options = chatMessagesQuerySchema.parse({ limit });
      return (client) => client.chatMessages(roomId, options);
    }
    case "chat-send": {
      const [roomId, input] = z.tuple([id, json.pipe(chatMessageInputSchema)]).parse(rest);
      return (client) => client.sendChatMessage(roomId, input);
    }
    default:
      throw new TodomateError("COMMAND_INVALID", "Unknown command. Run todomate --help.", 400);
  }
}
