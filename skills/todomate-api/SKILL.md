---
name: todomate-api
description: Use the local Todomate CLI to read and manage todos, reminders, friends, goals, and chat. Trigger when the user asks an AI agent to operate Todomate through this project.
---

# Todomate Local CLI

Use the local `todomate` command. Don't call a hosted API URL for normal agent work.

## Setup

The user must install and log in on each device and account:

```bash
bun install
bun run build
npm link
todomate login
```

The password prompt is hidden. The CLI stores a Firebase refresh token in `~/.config/todomate/session.json`, or under `TODOMATE_CONFIG_DIR` when set. The password isn't stored.

Don't ask for, print, read, copy, summarize, or expose the session file, password, refresh token, or any secret session content. Don't use shell commands to inspect the config directory. If login is required, ask the user to run `todomate login` themselves.

An optional HTTP API bearer token can't be reused by the CLI. Each device and user needs its own CLI login.

## Workflow

1. Run `todomate --help` if command syntax must be checked.
2. Use `todomate goals` before creating a todo, then use a returned `id` as `goalId`.
3. Use exact `YYYYMMDD` dates.
4. Parse stdout as structured JSON.
5. Treat exit status `1` and the JSON error on stderr as failure.
6. Confirm user intent before destructive deletes or social writes.

## Commands

- `todomate me`
- `todomate friends`
- `todomate goals`
- `todomate todos YYYYMMDD`
- `todomate user-todos USER_ID YYYYMMDD`
- `todomate user-todos-by-name NAME YYYYMMDD`
- `todomate todo-create '{"content":"...","goalId":"...","date":20261110}'`
- `todomate todo-update TODO_ID '{"content":"...","date":20261110}'`
- `todomate todo-complete TODO_ID`
- `todomate todo-complete TODO_ID '{"done":false}'`
- `todomate todo-delete TODO_ID`
- `todomate reminders`
- `todomate reminder-create '{"time":1800000000000}'`
- `todomate reminder-update REMINDER_ID '{"time":1800003600000}'`
- `todomate reminder-delete REMINDER_ID`
- `todomate chat-rooms`
- `todomate chat-messages ROOM_ID`
- `todomate chat-messages ROOM_ID LIMIT`
- `TODOMATE_ENABLE_SOCIAL_WRITES=true todomate chat-send ROOM_ID '{"content":"..."}'`
- `todomate logout`

`logout` deletes only the local session file. It doesn't remotely revoke Firebase tokens.

## Safety

Report success with record IDs, counts, and non-secret fields. Never include credentials, tokens, full session objects, or config file contents in output.
