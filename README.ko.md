# todomate-api

한국어 | [English](README.md)

[Todomate](https://www.todomate.net/)용 비공식 hosted HTTP API입니다.

공개 API base URL:

```bash
https://todomate-api.3xhaust.dev
```

이 프로젝트는 API-only입니다. 로컬 단일 계정 모드는 없고, 서버는 env에서 `TODOMATE_EMAIL`이나 `TODOMATE_PASSWORD`를 읽지 않습니다. 각 사용자는 `POST /auth/login`으로 로그인해서 이 API의 bearer token을 받고, 그 token으로 투두/알람/채팅 조회 API를 호출합니다.

서버는 Todomate 비밀번호를 저장하지 않습니다. 로그인 때 Firebase와 한 번 교환한 뒤, Firebase refresh token만 `SESSION_ENCRYPTION_KEY`로 암호화한 bearer session token 안에 넣습니다.

## 상태

구현된 기능:

- `/auth/login`을 통한 Firebase 이메일/비밀번호 로그인
- 공개 멀티 유저 사용을 위한 암호화 bearer session token
- 내 프로필 조회
- 목표 목록 조회
- 투두 조회, 추가, 완료/미완료 처리, 삭제
- 알람 조회, 추가, 수정, 삭제
- 채팅방/메시지 조회
- DM 전송 엔드포인트는 `TODOMATE_ENABLE_SOCIAL_WRITES=true`일 때만 활성화

알려진 제한:

- 비공식 API라 Todomate가 웹 앱이나 Firestore 규칙을 바꾸면 깨질 수 있습니다.
- DM 전송은 다른 사용자에게 영향을 주므로 기본값은 비활성화입니다.
- 크루 관리, 좋아요, AI 투두 생성, 다이어리, access-token 함수 등은 아직 발견/문서화 단계입니다.

## 빠른 시작

```bash
BASE_URL="https://todomate-api.3xhaust.dev"

curl -X POST "$BASE_URL/auth/login" \
  -H "content-type: application/json" \
  -d '{"email":"you@example.com","password":"your-password"}'
```

응답:

```json
{
  "tokenType": "Bearer",
  "token": "SESSION_TOKEN",
  "uid": "TODOMATE_UID",
  "expiresAt": 1800000000000
}
```

token 사용:

```bash
curl "$BASE_URL/goals" \
  -H "authorization: Bearer SESSION_TOKEN"
```

logout은 stateless입니다. 클라이언트에서 token을 삭제하면 됩니다:

```bash
curl -X POST "$BASE_URL/auth/logout" \
  -H "authorization: Bearer SESSION_TOKEN"
```

## API

### Health

```bash
curl "$BASE_URL/health"
```

### 계정

```bash
curl "$BASE_URL/me" \
  -H "authorization: Bearer SESSION_TOKEN"
```

### 목표

```bash
curl "$BASE_URL/goals" \
  -H "authorization: Bearer SESSION_TOKEN"
```

응답에 포함된 목표 `id`를 투두 생성 시 `goalId`로 사용합니다.

### 투두

투두 요청의 날짜는 `YYYYMMDD`를 사용합니다. API는 이를 Todomate 내부 형식인 UTC 자정 epoch millisecond date 필드로 변환합니다. 그래서 응답 레코드의 `date`에는 `1781654400000` 같은 값이 들어 있을 수 있습니다.

특정 날짜의 투두 조회:

```bash
curl "$BASE_URL/todos?date=20260617" \
  -H "authorization: Bearer SESSION_TOKEN"
```

투두 추가:

```bash
curl -X POST "$BASE_URL/todos" \
  -H "authorization: Bearer SESSION_TOKEN" \
  -H "content-type: application/json" \
  -d '{"content":"api로 추가한 투두","goalId":"GOAL_ID","date":20260617}'
```

투두 완료/미완료 처리:

```bash
curl -X PATCH "$BASE_URL/todos/TODO_ID/complete" \
  -H "authorization: Bearer SESSION_TOKEN" \
  -H "content-type: application/json" \
  -d '{"done":true}'
```

투두 삭제:

```bash
curl -X DELETE "$BASE_URL/todos/TODO_ID" \
  -H "authorization: Bearer SESSION_TOKEN"
```

### 알람

```bash
curl "$BASE_URL/reminders" \
  -H "authorization: Bearer SESSION_TOKEN"
```

추가:

```bash
curl -X POST "$BASE_URL/reminders" \
  -H "authorization: Bearer SESSION_TOKEN" \
  -H "content-type: application/json" \
  -d '{"time":1800000000000}'
```

수정:

```bash
curl -X PATCH "$BASE_URL/reminders/REMINDER_ID" \
  -H "authorization: Bearer SESSION_TOKEN" \
  -H "content-type: application/json" \
  -d '{"time":1800003600000}'
```

삭제:

```bash
curl -X DELETE "$BASE_URL/reminders/REMINDER_ID" \
  -H "authorization: Bearer SESSION_TOKEN"
```

### 채팅 / DM

채팅방 조회:

```bash
curl "$BASE_URL/chat/rooms" \
  -H "authorization: Bearer SESSION_TOKEN"
```

메시지 조회:

```bash
curl "$BASE_URL/chat/rooms/ROOM_ID/messages?limit=50" \
  -H "authorization: Bearer SESSION_TOKEN"
```

메시지 전송. 배포 환경에서 social write를 명시적으로 켠 경우에만 동작합니다:

```bash
curl -X POST "$BASE_URL/chat/rooms/ROOM_ID/messages" \
  -H "authorization: Bearer SESSION_TOKEN" \
  -H "content-type: application/json" \
  -d '{"content":"안녕"}'
```

## AI Skill

API-only Codex skill 예시는 `skills/todomate-api/SKILL.md`에 있습니다.

Codex에 설치:

```bash
mkdir -p ~/.codex/skills/todomate-api
cp skills/todomate-api/SKILL.md ~/.codex/skills/todomate-api/SKILL.md
```

agent용 권장 env:

```bash
export TODOMATE_API_BASE_URL="https://todomate-api.3xhaust.dev"
export TODOMATE_API_TOKEN="SESSION_TOKEN"
```

agent는 일반 작업에 bearer token을 사용하고, 로그인 이후 Todomate 비밀번호를 다시 묻거나 저장하지 않아야 합니다.

## 개발

API 서버 자체를 개발하려는 경우:

```bash
git clone https://github.com/3x-haust/todomate-api.git
cd todomate-api
bun install
cp .env.example .env
```

session key 설정:

```bash
SESSION_ENCRYPTION_KEY="$(openssl rand -hex 32)"
```

Firebase Auth REST endpoint에 사용할 Todomate Firebase web API key 설정:

```bash
TODOMATE_FIREBASE_API_KEY="..."
```

API 실행:

```bash
bun run dev
```

개발 서버도 production과 같은 API login flow를 사용합니다.

## 검증

```bash
bun test
bun run typecheck
bun run lint
```

선택 사항인 live API smoke test입니다. bearer token이 필요하고, HTTP API로 투두 하나를 만들고 완료 처리한 뒤 삭제합니다:

```bash
TODOMATE_API_TOKEN="SESSION_TOKEN" bun run smoke:live
```

## 배포

이 repo는 `Dockerfile`과 얇은 NestJS production entrypoint를 포함합니다. 그래서 Node/Nest 배포 플랫폼이 프로젝트를 감지해서 실행할 수 있고, 실제 API 로직은 그대로 Hono 앱에 있습니다.

운영 환경 필수 env:

```bash
TODOMATE_FIREBASE_API_KEY="<Todomate Firebase web API key>"
SESSION_ENCRYPTION_KEY="<openssl rand -hex 32로 생성한 64자 hex 문자열>"
SESSION_TTL_DAYS="30"
CORS_ORIGIN="*"
TODOMATE_ENABLE_SOCIAL_WRITES="false"
TODOMATE_PORT="3000"
```

Firebase web API key는 Firebase admin secret이 아니라 웹 앱 공개 client 설정입니다. 그래도 public repo에 박아두면 secret scanning이 계속 울리므로 env로만 주입합니다.

`@3xhaust/deploy-cli`로 배포:

```bash
deploy projects create \
  --repo 3x-haust/todomate-api \
  --name todomate-api \
  --branch main \
  --domain todomate-api.3xhaust.dev \
  --env TODOMATE_FIREBASE_API_KEY="$TODOMATE_FIREBASE_API_KEY" \
  --env SESSION_ENCRYPTION_KEY="$(openssl rand -hex 32)" \
  --env SESSION_TTL_DAYS=30 \
  --env CORS_ORIGIN="*" \
  --env TODOMATE_ENABLE_SOCIAL_WRITES=false \
  --env TODOMATE_PORT=3000
```

## 안전 주의사항

- Todomate 이메일/비밀번호를 매 API 호출마다 보내지 마세요. `/auth/login`을 한 번 호출한 뒤 bearer token을 사용하세요.
- session token은 비공개로 유지하세요. 만료 전까지 연결된 Todomate 계정에 쓰기 작업을 할 수 있습니다.
- 공개 배포에서는 HTTPS와 강한 `SESSION_ENCRYPTION_KEY`를 사용하세요.
- 이 공개 API는 브라우저와 서버 클라이언트 모두 호출할 수 있게 `CORS_ORIGIN="*"`를 쓰며, 특정 브라우저 앱을 운영하게 되면 그 프론트엔드 origin으로 좁히세요.
- 모든 쓰기 엔드포인트는 실제 Todomate 계정에 반영되는 작업으로 취급하세요.
- Firebase API key는 Todomate 웹 앱의 공개 client 설정이며 서버 비밀키가 아니지만, source tree에는 저장하지 마세요.
