# orbit-app

2026 DSL Gathering: The ORBIT 행사용 네트워킹 웹앱이다. 설치 없이 링크 하나로 쓰는 모바일 웹앱이고, 참가자 명함·테이블토크·커피챗 재배정·포스터세션 스탬프를 다룬다. 연구 코드(그래프 SID 실험)는 별도 저장소 `26-2_Modeling_RecSys` 에 있고, 이 저장소는 서비스 코드만 둔다.

## 구조

| 경로 | 내용 | 담당 |
|---|---|---|
| `apps/web` | Next.js(App Router, TypeScript, Tailwind) 웹앱. 화면과 API Route | 모듈별 담당 |
| `services/compute` | Python FastAPI 계산 서비스. 전날 배치(임베딩·주소·테이블토크 배정)와 커피챗 재계산 | 민찬 |
| `supabase/migrations` | DB 스키마 정본(SQL). 바꾸려면 PR | 성하 |
| `supabase/seed.sql` | 개발용 가짜 데이터(참가자 10명, 포스터 5개) | 성하 |
| `docs/` | 계약 문서. 모듈 경계, 스키마 설명, API 규칙, QR 형식, Supabase 설정 순서 | 전원 |

모듈 담당(회의록 14): 온보딩·홈탭·명함은 성하, 테이블토크·커피챗·포스터세션은 민찬. 모듈은 서로 import 하지 않는다. 자세한 규칙은 `docs/MODULES.md`.

## 시작하기

```bash
git clone <저장소 주소>
cd orbit-app/apps/web
npm install
cp .env.example .env.local      # 값은 팀 채널에서 받은 것으로 채운다. 커밋 금지
npm run dev                     # http://localhost:3000
```

계산 서비스는 `services/compute/README.md` 를 본다. DB 는 Supabase 대시보드에서 `supabase/migrations` 의 SQL 을 순서대로 실행한다(`docs/SETUP_SUPABASE.md`).

## 규칙 다섯 줄

1. 언어는 TypeScript(웹)와 Python(계산) 둘뿐이다.
2. 브라우저는 DB 를 직접 부르지 않는다. 모든 읽기·쓰기는 `app/api/*` 를 거친다.
3. 스키마·API 응답 형식·QR 형식은 `docs/` 가 정본이다. 바꾸려면 문서와 SQL 을 같은 PR 에서 고친다.
4. 키는 `.env.local` 에만 둔다. 커밋 금지.
5. main 에는 PR 로만 합친다. PR 에는 실행 확인 결과를 적는다.

## 일정

| 기한 | 목표 |
|---|---|
| 9/28 | 배포 뼈대(Vercel, Supabase dev), 모듈별 백지 화면 |
| 10/3 | 사전 등록 데이터 적재, 전날 배치 발급 경로, 온보딩 로그인 |
| 10/10 | 테이블토크·커피챗 재계산·포스터 스탬프·명함 교환 동작 |
| 10/12 | 합치는 날. 배포 주소에서 한 바퀴 |
| 10/17 | 리허설 1 (운영진 + 모델링팀) |
| 10/24 | 기능 동결 |
| 10/29 | 마지막 배포 |
| 10/31 | 행사 |
