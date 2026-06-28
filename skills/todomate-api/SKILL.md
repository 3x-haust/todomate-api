---
name: todomate-api
description: Use the hosted Todomate unofficial HTTP API to read/create/complete todos, manage reminders, and read chat through bearer-token auth. Trigger when the user asks an AI agent to operate Todomate through todomate-api or the hosted todomate-api. API-only: do not use local single-account env credentials.
---

# Todomate API

Use the hosted HTTP API only. Do not read `TODOMATE_EMAIL` or `TODOMATE_PASSWORD` from env, and do not create a local Todomate client.

## Configuration

Read:

- `TODOMATE_API_BASE_URL`, default `https://todomate-api.3xhaust.dev`
- `TODOMATE_API_TOKEN`, bearer session token from `/auth/login`

If `TODOMATE_API_TOKEN` is missing, ask the user for an existing session token. If the user explicitly wants to log in, call `/auth/login` once with the provided Todomate email/password, then use only the returned bearer token.

## Workflow

1. Check `GET /health`.
2. For protected routes, send `Authorization: Bearer <TODOMATE_API_TOKEN>`.
3. To create a todo, call `GET /goals` first and use one returned `id` as `goalId`.
4. Use exact date integers in `YYYYMMDD` format for dated todos.
5. Treat todo, reminder, and DM writes as real production writes. Confirm user intent for destructive deletes or social writes.

## Endpoints

- `POST /auth/login` with `{ "email": "...", "password": "..." }`
- `GET /me`
- `GET /friends`
- `GET /goals`
- `GET /todos?date=YYYYMMDD`
- `GET /users/:userId/todos?date=YYYYMMDD`
- `GET /users/by-name/:name/todos?date=YYYYMMDD`
- `POST /todos`
- `PATCH /todos/:id`
- `PATCH /todos/:id/complete`
- `DELETE /todos/:id`
- `GET /reminders`
- `POST /reminders`
- `PATCH /reminders/:id`
- `DELETE /reminders/:id`
- `GET /chat/rooms`
- `GET /chat/rooms/:roomId/messages?limit=50`
- `POST /chat/rooms/:roomId/messages` only when social writes are enabled

## Safety

Never print session tokens, passwords, refresh tokens, or full Authorization headers. Summarize success using record ids and counts.
