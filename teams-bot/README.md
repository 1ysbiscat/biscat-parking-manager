# BISCAT Parking Manager

Microsoft Teams에서 버튼으로 주차 체크인/체크아웃을 처리하는 사내 MVP입니다.

사무실 주차 가능 대수는 항상 2대입니다. 대표님/상무님은 우선 사용자로 표시할 수 있고, 자리가 비어 있을 때 직원이 임시로 사용할 수 있습니다.

## 핵심 기능

- Teams Adaptive Card 버튼으로 체크인, 체크아웃, 새로고침
- 총 2대 제한
- 사용자 1명당 활성 체크인 1개 제한
- 자동 자리 배정: 비어 있는 가장 빠른 번호부터 배정
- 관리자 수동 점유/해제
- 매일 오전 8시 Teams 채널에 주차 현황 발송
- 매일 오후 10시 미체크아웃 차량 알림 또는 자동 체크아웃
- Supabase 저장
- Node.js + TypeScript strict mode

## 구조

```text
src/
  config/              환경변수 로딩
  domain/              주차 도메인 타입과 상수
  repositories/        Supabase 저장소
  services/            주차 비즈니스 규칙
  teams/               Teams Bot, Adaptive Card, 채널 상태 저장
  scheduler/           매일 오전/오후 작업
supabase/schema.sql    데이터베이스 스키마
teams/manifest.template.json
```

## Supabase 설정

1. Supabase 프로젝트를 생성합니다.
2. Supabase SQL Editor에서 `supabase/schema.sql`을 실행합니다.
3. Project Settings에서 `SUPABASE_URL`과 `service_role` key를 복사합니다.
4. 이 서버는 서버 사이드 전용이므로 `SUPABASE_SERVICE_ROLE_KEY`를 사용합니다. 클라이언트나 Teams 카드에는 절대 노출하지 마세요.

주요 테이블:

- `parking_sessions`: 체크인/체크아웃 이력
- `parking_bot_state`: Teams 채널 대화 정보와 최근 현황 메시지 ID 저장

동시 체크인 방지는 Supabase/Postgres partial unique index로 한 번 더 막습니다.

## Azure Bot 등록

1. Azure Portal에서 Azure Bot을 생성합니다.
2. Bot의 Microsoft App ID를 `.env`의 `MICROSOFT_APP_ID`에 넣습니다.
3. App registration에서 client secret을 만들고 `.env`의 `MICROSOFT_APP_PASSWORD`에 넣습니다.
4. Bot Messaging endpoint를 아래처럼 설정합니다.

```text
https://YOUR_PUBLIC_DOMAIN/api/messages
```

5. Azure Bot의 Channels에서 Microsoft Teams 채널을 활성화합니다.

로컬 개발 중에는 dev tunnel 또는 ngrok 같은 공개 HTTPS 터널이 필요합니다.

## Teams 앱 등록

1. Microsoft Teams Developer Portal에서 새 앱을 만듭니다.
2. `teams/manifest.template.json`을 기준으로 manifest를 채웁니다.
3. `${MICROSOFT_APP_ID}`를 Azure Bot의 App ID로 교체합니다.
4. `validDomains`에 실제 공개 도메인을 넣습니다.
5. `color.png`, `outline.png` 아이콘을 앱 패키지에 포함합니다.
6. 앱 패키지를 Teams에 업로드하고 대상 팀/채널에 추가합니다.

설치 후 주차 현황을 받을 Teams 채널에서 bot을 멘션해 `parking`을 한 번 보내세요. 예: `@BISCAT Parking parking`. 이 메시지를 통해 bot이 매일 오전 8시에 게시할 채널 정보를 저장합니다.

## 환경변수

`.env.example`을 `.env`로 복사한 뒤 값을 채웁니다.

```text
PORT=3978
PUBLIC_BASE_URL=https://your-public-bot-url.example.com

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

MICROSOFT_APP_ID=your-azure-bot-app-id
MICROSOFT_APP_PASSWORD=your-azure-bot-client-secret
MICROSOFT_APP_TYPE=MultiTenant
MICROSOFT_APP_TENANT_ID=

ADMIN_USER_IDS=admin-aad-object-id-1,admin-aad-object-id-2
PRIORITY_USERS=ceo-aad-object-id:대표님,executive-director-aad-object-id:상무님
DEFAULT_PRIORITY_LABELS=대표님,상무님

TIME_ZONE=Asia/Seoul
ENABLE_SCHEDULER=true
DAILY_CLOSE_MODE=notify_admins
JOB_SECRET=change-me
```

`DAILY_CLOSE_MODE` 값:

- `notify_admins`: 오후 10시에 미체크아웃 차량을 Teams 채널에 알림
- `auto_checkout`: 오후 10시에 모든 미체크아웃 차량을 자동 체크아웃

## 실행

```bash
npm install
npm run dev
```

빌드 후 실행:

```bash
npm run build
npm start
```

상태 확인:

```bash
curl http://localhost:3978/api/health
curl http://localhost:3978/api/parking/status
```

## Teams 사용법

일반 직원:

1. Teams 주차 현황 카드에서 `체크인` 클릭
2. 퇴근 시 `체크아웃` 클릭
3. 현황이 이상하면 `새로고침` 클릭

관리자:

1. Bot에게 `admin` 또는 `관리자`라고 보냅니다.
2. 관리자 카드에서 `1번 점유`, `1번 해제`, `2번 점유`, `2번 해제`를 사용합니다.
3. `ADMIN_USER_IDS`에 등록된 Microsoft Entra object ID만 관리자 액션을 실행할 수 있습니다.

## 스케줄 작업

서버가 계속 실행되는 Azure App Service 같은 환경에서는 `ENABLE_SCHEDULER=true`로 두면 됩니다.

서버리스나 외부 cron을 쓸 경우 아래 endpoint를 호출할 수 있습니다.

```bash
curl -X POST https://YOUR_PUBLIC_DOMAIN/api/jobs/morning-status \
  -H "x-job-secret: change-me"

curl -X POST https://YOUR_PUBLIC_DOMAIN/api/jobs/daily-close \
  -H "x-job-secret: change-me"
```

## 참고 문서

- [Microsoft Teams card actions](https://learn.microsoft.com/en-us/microsoftteams/platform/task-modules-and-cards/cards/cards-actions)
- [Microsoft Graph channel messages](https://learn.microsoft.com/en-us/graph/api/channel-post-messages?view=graph-rest-1.0)
- [Supabase JavaScript TypeScript support](https://supabase.com/docs/reference/javascript/typescript-support)
