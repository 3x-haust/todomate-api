# todomate-api

한국어 | [English](README.md)

[Todomate](https://www.todomate.net/)용 비공식 로컬 CLI와 선택 사항인 HTTP API입니다.

이 프로젝트의 기본 사용 방식은 로컬 CLI입니다. CLI가 Todomate Firebase 서비스에 직접 연결하므로 일반적인 CLI 사용에는 hosted API, `SESSION_ENCRYPTION_KEY`, 로컬 서버가 필요하지 않습니다.

## 상태

구현된 기능:

- Firebase 이메일/비밀번호 로그인
- 로컬 session 저장
- 내 프로필, 친구, 목표 조회
- 투두 조회, 추가, 수정, 완료/미완료 처리, 삭제
- 알람 조회, 추가, 수정, 삭제
- 채팅방과 메시지 조회
- `TODOMATE_ENABLE_SOCIAL_WRITES=true`일 때 DM 전송
- 암호화된 bearer session을 사용하는 선택 사항 멀티 유저 HTTP API

알려진 제한:

- 비공식 프로젝트라 Todomate가 웹 앱이나 Firestore 규칙을 바꾸면 깨질 수 있습니다.
- DM 전송은 다른 사용자에게 영향을 주므로 기본값은 비활성화입니다.
- 크루 관리, 좋아요, AI 투두 생성, 다이어리, access-token 함수 등은 아직 발견 단계입니다.

## 로컬 CLI 빠른 시작

의존성을 설치한 뒤 로그인합니다:

```bash
git clone https://github.com/3x-haust/todomate-api.git
cd todomate-api
bun install
bun run cli login
```

대화형 프롬프트는 비밀번호를 화면에 표시하지 않습니다. 비대화형 환경에서는 stdin으로 JSON credentials를 전달할 수 있습니다. 실제 credentials를 shell history나 문서에 넣지 마세요:

```bash
printf '%s' '{"email":"user@example.com","password":"example-only"}' | bun run cli login
```

로그인할 때 Todomate hosting에서 공개 Firebase web 설정을 자동으로 찾습니다. 자동 탐색을 덮어써야 할 때만 `TODOMATE_FIREBASE_API_KEY`를 설정하세요.

각 기기와 사용자는 직접 `login`해야 합니다. 선택 사항인 HTTP API가 발급한 bearer token은 형식이 다른 session이므로 CLI에서 재사용할 수 없습니다.

### Session 저장

CLI는 Firebase refresh token을 전용 로컬 config 디렉터리에 plaintext JSON으로 저장합니다:

- 기본 디렉터리: `~/.config/todomate`
- session 파일: `~/.config/todomate/session.json`
- 디렉터리 권한: POSIX `0700`
- 파일 권한: POSIX `0600`

다른 디렉터리를 사용하려면 `TODOMATE_CONFIG_DIR`을 설정하세요. 비밀번호는 로그인할 때만 사용하고 저장하지 않습니다. refresh token은 연결된 Todomate 계정에 접근할 수 있으므로 session 파일을 보호해야 합니다.

Logout은 로컬 session 파일만 삭제합니다. Firebase token을 원격으로 revoke하지 않습니다:

```bash
bun run cli logout
```

### 명령

도움말을 제외한 명령 결과는 구조화된 JSON입니다. 실패 시 stderr에 JSON error를 출력하고 exit status `1`로 종료합니다.

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

bun run cli todo-create '{"content":"문서 배포","goalId":"GOAL_ID","date":20261110}'
bun run cli todo-update TODO_ID '{"content":"문서 수정","date":20261110}'
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
TODOMATE_ENABLE_SOCIAL_WRITES=true bun run cli chat-send ROOM_ID '{"content":"안녕"}'
```

투두 날짜는 `YYYYMMDD` 형식입니다. 투두를 만들기 전에 `goals`를 실행하고 반환된 `id`를 `goalId`로 사용하세요. 채팅 메시지 limit 범위는 1부터 200까지입니다.

### 선택 사항인 전역 명령

패키지는 `dist/cli.js`를 `todomate` binary로 정의합니다. 이 checkout을 build하고 link하면 전역 명령으로 사용할 수 있습니다:

```bash
bun run build
npm link
todomate --help
todomate login
```

이 방법은 로컬 link workflow이며 npm에 package가 배포되었다는 뜻이 아닙니다.

## AI Skill

로컬 CLI skill은 `skills/todomate-api/SKILL.md`에 있습니다.

```bash
mkdir -p ~/.codex/skills/todomate-api
cp skills/todomate-api/SKILL.md ~/.codex/skills/todomate-api/SKILL.md
```

Agent는 hosted URL 대신 로컬 `todomate` 명령을 사용해야 합니다. 각 사용자가 자신의 기기와 계정에서 로그인을 완료해야 합니다. Agent는 `session.json`, refresh token, 비밀번호 등 secret session 내용을 출력하거나 읽으면 안 됩니다.

## 선택 사항인 HTTP Server API

멀티 유저 bearer-token API가 필요한 배포 환경에서는 HTTP server를 계속 사용할 수 있습니다. 로컬 CLI에는 필요하지 않습니다.

HTTP API가 필요하면 직접 인스턴스를 실행하세요. 예시는 로컬 서버를 사용합니다:

```text
http://localhost:3000
```

Server login은 Todomate 이메일/비밀번호를 한 번 받아 Firebase와 교환한 뒤, 이 API 전용 암호화 bearer session token을 반환합니다. Server는 비밀번호를 저장하지 않습니다. 이 bearer token은 로컬 CLI로 가져올 수 없습니다.

### Server 실행

```bash
cp .env.example .env
export SESSION_ENCRYPTION_KEY="$(openssl rand -hex 32)"
export TODOMATE_FIREBASE_API_KEY="<Todomate Firebase web API key>"
bun run dev
```

Hosted mode 설정:

```bash
TODOMATE_FIREBASE_API_KEY="<필수 Todomate Firebase web API key>"
SESSION_ENCRYPTION_KEY="<openssl rand -hex 32로 생성한 64자 hex 문자열>"
SESSION_TTL_DAYS="30"
CORS_ORIGIN="*"
TODOMATE_ENABLE_SOCIAL_WRITES="false"
TODOMATE_PORT="3000"
```

HTTP 서버에는 두 키가 모두 필요하며 Firebase 키 자동 탐색은 지원하지 않습니다. 로컬 CLI에는 두 환경변수 모두 필요하지 않습니다. Firebase web API key는 Firebase admin secret이 아니라 공개 client 설정입니다.

### HTTP 예시

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

사용 가능한 protected route:

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
- `POST /chat/rooms/:roomId/messages`, social write가 활성화된 경우에만 사용

`GET /health`, `POST /auth/login`, `POST /auth/logout`도 사용할 수 있습니다. HTTP logout은 stateless이므로 client에서 bearer token을 버려야 합니다.

## 검증

```bash
bun test
bun run typecheck
bun run lint
```

선택 사항인 live smoke test는 HTTP API bearer token을 사용합니다. 투두 하나를 만들고 완료 처리한 뒤 삭제합니다:

```bash
TODOMATE_API_TOKEN="SESSION_TOKEN" bun run smoke:live
```

## 배포

Repository에는 `Dockerfile`과 얇은 NestJS production entrypoint가 있습니다. API 로직은 Hono app에 유지됩니다.

배포 예시:

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

## 안전 주의사항

- 모든 write는 연결된 Todomate 계정에 적용되는 production 변경으로 취급하세요.
- 로컬 refresh token과 hosted bearer token을 비공개로 유지하세요.
- 요청마다 비밀번호를 보내지 마세요. 한 번 로그인한 뒤 만들어진 로컬 또는 hosted session을 사용하세요.
- 공개 HTTP 배포에서는 HTTPS와 강한 `SESSION_ENCRYPTION_KEY`를 사용하세요.
- 특정 browser app을 위한 배포라면 `CORS_ORIGIN`을 해당 origin으로 좁히세요.
- Firebase API key는 공개 web client 설정이지만 source에 저장할 필요는 없습니다.
