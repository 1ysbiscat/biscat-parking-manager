# BISCAT Parking Manager

BISCAT 사무실의 2대 주차 공간을 Microsoft Teams에서 간단히 체크인/체크아웃하는 내부 MVP입니다.

이 저장소는 두 부분으로 나뉩니다.

- `src/app`: 기존 Next.js 앱
- `teams-bot`: Microsoft Teams Bot Framework + Supabase 기반 주차 관리 Bot

## Teams Bot MVP

Bot 구현은 기존 Next.js 구조와 충돌하지 않도록 `teams-bot/`에 독립 패키지로 들어 있습니다.

주요 기능:

- Teams Adaptive Card 버튼으로 체크인, 체크아웃, 새로고침
- 총 주차 가능 대수 2대 고정
- 한 사용자당 활성 체크인 1개 제한
- 주차 공간이 꽉 차면 추가 체크인 불가
- 대표님/상무님 우선 사용자 표시
- 관리자 수동 점유/해제
- 매일 오전 8시 Teams 채널에 주차 현황 발송
- 매일 오후 10시 미체크아웃 차량 알림 또는 자동 체크아웃

자세한 Azure Bot, Teams 앱, Supabase, 환경변수 설정은 `teams-bot/README.md`를 확인하세요.

## Next.js 실행

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:3000`을 엽니다.

## Teams Bot 실행

처음 한 번 Bot 패키지 의존성을 설치합니다.

```bash
npm --prefix teams-bot install
```

개발 실행:

```bash
npm run bot:dev
```

빌드와 실행:

```bash
npm run bot:build
npm run bot:start
```

타입 체크:

```bash
npm run bot:typecheck
```

## Supabase 스키마

```text
teams-bot/supabase/schema.sql
```

Supabase SQL Editor에서 위 파일을 실행하면 됩니다.

## Teams 앱 Manifest

```text
teams-bot/teams/manifest.template.json
```

`MICROSOFT_APP_ID`와 `validDomains`를 실제 값으로 바꾼 뒤 Teams Developer Portal에 업로드하세요.
