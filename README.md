# todomate-api

[한국어](README.ko.md) | English

Unofficial hosted HTTP API for [Todomate](https://www.todomate.net/).

Public API base URL:

```bash
https://todomate-api.3xhaust.dev
```

This project is API-only. There is no local single-account mode and the server does not read `TODOMATE_EMAIL` or `TODOMATE_PASSWORD` from env. Each user logs in through `POST /auth/login`, receives this API's bearer token, and uses that token for todos, reminders, and chat reads.

The server does not store Todomate passwords. Login exchanges the password with Firebase once, then encrypts the Firebase refresh token into a bearer session token with `SESSION_ENCRYPTION_KEY`.

## Status

Implemented:

- Firebase email/password login through `/auth/login`
- encrypted bearer session tokens for public multi-user use
- `me` profile read
- goals read
- todos read, create, complete/uncomplete, delete
- reminders read, create, update, delete
- chat room/message read
- DM send endpoint guarded by `TODOMATE_ENABLE_SOCIAL_WRITES=true`

Known limits:

- This is unofficial and can break if Todomate changes its web app or Firestore rules.
- DM sending is experimental and disabled by default because it affects other users.
- Crew management, likes, generated AI todos, diary, and access-token functions are still discovery-only.

## Quick Start

```bash
BASE_URL="https://todomate-api.3xhaust.dev"

curl -X POST "$BASE_URL/auth/login" \
  -H "content-type: application/json" \
  -d '{"email":"you@example.com","password":"your-password"}'
```

Response:

```json
{
  "tokenType": "Bearer",
  "token": "SESSION_TOKEN",
  "uid": "TODOMATE_UID",
  "expiresAt": 1800000000000
}
```

Use the token:

```bash
curl "$BASE_URL/goals" \
  -H "authorization: Bearer SESSION_TOKEN"
```

Logout is stateless. Delete the token client-side:

```bash
curl -X POST "$BASE_URL/auth/logout" \
  -H "authorization: Bearer SESSION_TOKEN"
```

## API

### Health

```bash
curl "$BASE_URL/health"
```

### Account

```bash
curl "$BASE_URL/me" \
  -H "authorization: Bearer SESSION_TOKEN"
```

### Friends

```bash
curl "$BASE_URL/friends" \
  -H "authorization: Bearer SESSION_TOKEN"
```

Returns `{ "following": [...], "followers": [...] }` profiles for the current bearer session.

### Goals

```bash
curl "$BASE_URL/goals" \
  -H "authorization: Bearer SESSION_TOKEN"
```

Use one returned `id` as `goalId` when creating todos.

### Todos

Todo request dates use `YYYYMMDD`. The API converts them to Todomate's internal UTC-midnight epoch-millisecond date field, so response records may contain values such as `1781654400000`.

Read todos for a date:

```bash
curl "$BASE_URL/todos?date=20260617" \
  -H "authorization: Bearer SESSION_TOKEN"
```

Read another visible user's todos for a date:

```bash
curl "$BASE_URL/users/USER_ID/todos?date=20260617" \
  -H "authorization: Bearer SESSION_TOKEN"
```

This uses the current bearer session. It only returns records Todomate/Firebase allows that user to read.

Find visible user todos by exact display name:

```bash
curl "$BASE_URL/users/by-name/%ED%9A%A8%ED%83%80%EC%B9%B4%ED%86%A0/todos?date=20260617" \
  -H "authorization: Bearer SESSION_TOKEN"
```

The response is an array of `{ "user": ..., "todos": [...] }` groups because display names can be duplicated.

Create a todo:

```bash
curl -X POST "$BASE_URL/todos" \
  -H "authorization: Bearer SESSION_TOKEN" \
  -H "content-type: application/json" \
  -d '{"content":"ship todomate api","goalId":"GOAL_ID","date":20260617}'
```

Update todo content, goal, date, or reminder:

```bash
curl -X PATCH "$BASE_URL/todos/TODO_ID" \
  -H "authorization: Bearer SESSION_TOKEN" \
  -H "content-type: application/json" \
  -d '{"content":"edited todo","goalId":"GOAL_ID","date":20260617,"remindAt":null}'
```

Complete or uncomplete a todo:

```bash
curl -X PATCH "$BASE_URL/todos/TODO_ID/complete" \
  -H "authorization: Bearer SESSION_TOKEN" \
  -H "content-type: application/json" \
  -d '{"done":true}'
```

Delete a todo:

```bash
curl -X DELETE "$BASE_URL/todos/TODO_ID" \
  -H "authorization: Bearer SESSION_TOKEN"
```

### Reminders

```bash
curl "$BASE_URL/reminders" \
  -H "authorization: Bearer SESSION_TOKEN"
```

Create:

```bash
curl -X POST "$BASE_URL/reminders" \
  -H "authorization: Bearer SESSION_TOKEN" \
  -H "content-type: application/json" \
  -d '{"time":1800000000000}'
```

Update:

```bash
curl -X PATCH "$BASE_URL/reminders/REMINDER_ID" \
  -H "authorization: Bearer SESSION_TOKEN" \
  -H "content-type: application/json" \
  -d '{"time":1800003600000}'
```

Delete:

```bash
curl -X DELETE "$BASE_URL/reminders/REMINDER_ID" \
  -H "authorization: Bearer SESSION_TOKEN"
```

### Chat / DM

Read rooms:

```bash
curl "$BASE_URL/chat/rooms" \
  -H "authorization: Bearer SESSION_TOKEN"
```

Read messages:

```bash
curl "$BASE_URL/chat/rooms/ROOM_ID/messages?limit=50" \
  -H "authorization: Bearer SESSION_TOKEN"
```

Send message, only when the deployment explicitly enables social writes:

```bash
curl -X POST "$BASE_URL/chat/rooms/ROOM_ID/messages" \
  -H "authorization: Bearer SESSION_TOKEN" \
  -H "content-type: application/json" \
  -d '{"content":"hello"}'
```

## AI Skill

An API-only Codex skill example is included at `skills/todomate-api/SKILL.md`.

Install it into Codex:

```bash
mkdir -p ~/.codex/skills/todomate-api
cp skills/todomate-api/SKILL.md ~/.codex/skills/todomate-api/SKILL.md
```

Recommended env for agents:

```bash
export TODOMATE_API_BASE_URL="https://todomate-api.3xhaust.dev"
export TODOMATE_API_TOKEN="SESSION_TOKEN"
```

Agents should use the bearer token for normal work and should not ask for or store the Todomate password after login.

## Development

For contributors who want to run the API server itself:

```bash
git clone https://github.com/3x-haust/todomate-api.git
cd todomate-api
bun install
cp .env.example .env
```

Set a session key:

```bash
SESSION_ENCRYPTION_KEY="$(openssl rand -hex 32)"
```

Set the Todomate Firebase web API key used by Firebase Auth REST endpoints:

```bash
TODOMATE_FIREBASE_API_KEY="..."
```

Run the API:

```bash
bun run dev
```

The development server uses the same API login flow as production.

## Verification

```bash
bun test
bun run typecheck
bun run lint
```

Optional live API smoke test. It requires a bearer token, creates one todo through the HTTP API, completes it, and deletes it:

```bash
TODOMATE_API_TOKEN="SESSION_TOKEN" bun run smoke:live
```

## Deployment

This repo includes a `Dockerfile` and a thin NestJS production entrypoint so Node/Nest deployment platforms can detect and run it. The API logic still lives in the Hono app.

Required production env:

```bash
TODOMATE_FIREBASE_API_KEY="<Todomate Firebase web API key>"
SESSION_ENCRYPTION_KEY="<64 hex characters generated with openssl rand -hex 32>"
SESSION_TTL_DAYS="30"
CORS_ORIGIN="*"
TODOMATE_ENABLE_SOCIAL_WRITES="false"
TODOMATE_PORT="3000"
```

The Firebase web API key is public client configuration, not a Firebase admin secret. This project still keeps it in env so the public repository has no embedded key and GitHub secret scanning stays quiet.

Deploy with `@3xhaust/deploy-cli`:

```bash
deploy projects create \
  --repo 3x-haust/todomate-api \
  --name todomate-api \
  --branch main \
  --domain todomate-api.3xhaust.dev \
  --env SESSION_ENCRYPTION_KEY="$(openssl rand -hex 32)" \
  --env SESSION_TTL_DAYS=30 \
  --env CORS_ORIGIN="*" \
  --env TODOMATE_ENABLE_SOCIAL_WRITES=false \
  --env TODOMATE_PORT=3000
```

## Safety Notes

- Do not send Todomate email/password on every API call. Use `/auth/login` once, then the bearer token.
- Keep session tokens private. They can mutate the connected Todomate account until they expire.
- Public deployments must use HTTPS and a strong `SESSION_ENCRYPTION_KEY`.
- This public API currently uses `CORS_ORIGIN="*"` so browser and server clients can both call it; narrow it to your frontend origin once you operate a specific browser app.
- Treat all write endpoints as production writes to your Todomate account.
- The Firebase API key is public client configuration from the Todomate web app, not a server secret.
