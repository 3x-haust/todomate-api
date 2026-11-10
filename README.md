# todomate-api

[한국어](README.ko.md) | English

Unofficial local CLI and optional HTTP API for [Todomate](https://www.todomate.net/).

The local CLI is the default way to use this project. It connects directly to Todomate's Firebase services, so normal CLI use doesn't require a hosted API, `SESSION_ENCRYPTION_KEY`, or a local server.

## Status

Implemented:

- Firebase email/password login
- local session storage
- profile, friends, and goals reads
- todo reads, create, update, complete/uncomplete, and delete
- reminder reads, create, update, and delete
- chat room and message reads
- DM sending when `TODOMATE_ENABLE_SOCIAL_WRITES=true`
- optional multi-user HTTP API with encrypted bearer sessions

Known limits:

- This project is unofficial and can break if Todomate changes its web app or Firestore rules.
- DM sending is experimental and disabled by default because it affects other users.
- Crew management, likes, generated AI todos, diary, and access-token functions are still discovery-only.

## Local CLI Quick Start

Install dependencies, then log in:

```bash
git clone https://github.com/3x-haust/todomate-api.git
cd todomate-api
bun install
bun run cli login
```

The interactive prompt reads the password without echoing it. For non-interactive use, pass credentials as JSON through stdin. Don't put real credentials in shell history or documentation:

```bash
printf '%s' '{"email":"user@example.com","password":"example-only"}' | bun run cli login
```

Login discovers Todomate's public Firebase web configuration from Todomate hosting. Set `TODOMATE_FIREBASE_API_KEY` only when you need to override that discovery.

Each device and user must run `login` themselves. A bearer token issued by the optional HTTP API is a different session format and can't be reused by the CLI.

### Session storage

The CLI stores the Firebase refresh token as plaintext JSON in a dedicated local config directory:

- default directory: `~/.config/todomate`
- session file: `~/.config/todomate/session.json`
- directory permission: POSIX `0700`
- file permission: POSIX `0600`

Set `TODOMATE_CONFIG_DIR` to use another directory. The password is used only for login and isn't stored. Protect the session file because its refresh token can access the connected Todomate account.

Logout only deletes the local session file. It doesn't remotely revoke Firebase tokens:

```bash
bun run cli logout
```

### Commands

Command results are structured JSON, except for help text. Failures are printed as JSON on stderr and exit with status `1`.

```text
bun run cli --help
bun run cli login
bun run cli logout

bun run cli me
bun run cli friends
bun run cli goals

bun run cli todos YYYYMMDD
bun run cli user-todos USER_ID YYYYMMDD
bun run cli user-todos-by-name NAME YYYYMMDD

bun run cli todo-create '{"content":"ship docs","goalId":"GOAL_ID","date":20261110}'
bun run cli todo-update TODO_ID '{"content":"edit docs","date":20261110}'
bun run cli todo-complete TODO_ID
bun run cli todo-complete TODO_ID '{"done":false}'
bun run cli todo-delete TODO_ID

bun run cli reminders
bun run cli reminder-create '{"time":1800000000000}'
bun run cli reminder-update REMINDER_ID '{"time":1800003600000}'
bun run cli reminder-delete REMINDER_ID

bun run cli chat-rooms
bun run cli chat-messages ROOM_ID
bun run cli chat-messages ROOM_ID 100
TODOMATE_ENABLE_SOCIAL_WRITES=true bun run cli chat-send ROOM_ID '{"content":"hello"}'
```

Todo dates use `YYYYMMDD`. Run `goals` first and use a returned `id` as `goalId` when creating a todo. Chat message limits must be between 1 and 200.

### Optional global command

The package defines the `todomate` binary at `dist/cli.js`. Build and link this checkout if you want a global command:

```bash
bun run build
npm link
todomate --help
todomate login
```

This is a local link workflow, not a claim that the package is published to npm.

## AI Skill

The local CLI skill is at `skills/todomate-api/SKILL.md`.

```bash
mkdir -p ~/.codex/skills/todomate-api
cp skills/todomate-api/SKILL.md ~/.codex/skills/todomate-api/SKILL.md
```

Agents should call the local `todomate` command, not a hosted URL. A user must complete login for their own device and account. Agents must never print or inspect the contents of `session.json`, refresh tokens, passwords, or other secret session data.

## Optional HTTP Server API

The HTTP server remains available for deployments that need a multi-user bearer-token API. It isn't required for the local CLI.

For optional HTTP use, run your own instance. The examples use a local server:

```text
http://localhost:3000
```

Server login accepts a Todomate email/password once, exchanges it with Firebase, and returns this API's encrypted bearer session token. The server doesn't store the password. Its bearer token can't be imported into the local CLI.

### Run the server

```bash
cp .env.example .env
export SESSION_ENCRYPTION_KEY="$(openssl rand -hex 32)"
export TODOMATE_FIREBASE_API_KEY="<Todomate Firebase web API key>"
bun run dev
```

Hosted mode uses:

```bash
TODOMATE_FIREBASE_API_KEY="<required Todomate Firebase web API key>"
SESSION_ENCRYPTION_KEY="<64 hex characters generated with openssl rand -hex 32>"
SESSION_TTL_DAYS="30"
CORS_ORIGIN="*"
TODOMATE_ENABLE_SOCIAL_WRITES="false"
TODOMATE_PORT="3000"
```

The HTTP server requires both keys and does not discover the Firebase key automatically. The local CLI needs neither variable. The Firebase web API key is public client configuration, not a Firebase admin secret.

### HTTP examples

```bash
BASE_URL="http://localhost:3000"

curl -X POST "$BASE_URL/auth/login" \
  -H "content-type: application/json" \
  -d '{"email":"user@example.com","password":"example-only"}'

curl "$BASE_URL/me" -H "authorization: Bearer SESSION_TOKEN"
curl "$BASE_URL/friends" -H "authorization: Bearer SESSION_TOKEN"
curl "$BASE_URL/goals" -H "authorization: Bearer SESSION_TOKEN"
curl "$BASE_URL/todos?date=20261110" -H "authorization: Bearer SESSION_TOKEN"
curl "$BASE_URL/reminders" -H "authorization: Bearer SESSION_TOKEN"
curl "$BASE_URL/chat/rooms" -H "authorization: Bearer SESSION_TOKEN"
```

Available protected routes:

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
- `POST /chat/rooms/:roomId/messages`, only when social writes are enabled

`GET /health`, `POST /auth/login`, and `POST /auth/logout` are also available. HTTP logout is stateless, so clients must discard their bearer token.

## Verification

```bash
bun test
bun run typecheck
bun run lint
```

The optional live smoke test uses an HTTP API bearer token. It creates, completes, and deletes one todo:

```bash
TODOMATE_API_TOKEN="SESSION_TOKEN" bun run smoke:live
```

## Deployment

The repository includes a `Dockerfile` and a thin NestJS production entrypoint. The API logic remains in the Hono app.

Example deployment:

```bash
deploy projects create \
  --repo 3x-haust/todomate-api \
  --name todomate-api \
  --branch main \
  --domain api.example.com \
  --env TODOMATE_FIREBASE_API_KEY="$TODOMATE_FIREBASE_API_KEY" \
  --env SESSION_ENCRYPTION_KEY="$(openssl rand -hex 32)" \
  --env SESSION_TTL_DAYS=30 \
  --env CORS_ORIGIN="*" \
  --env TODOMATE_ENABLE_SOCIAL_WRITES=false \
  --env TODOMATE_PORT=3000
```

## Safety Notes

- Treat all writes as production changes to the connected Todomate account.
- Keep local refresh tokens and hosted bearer tokens private.
- Don't send a password on every request. Login once and use the resulting local or hosted session.
- Public HTTP deployments must use HTTPS and a strong `SESSION_ENCRYPTION_KEY`.
- Narrow `CORS_ORIGIN` when a deployment serves a specific browser app.
- The Firebase API key is public web-client configuration, but it doesn't need to be stored in source.
