# Supabase 프로젝트 만들기 (성하가 한다, 15분)

계정·비밀번호·키 입력은 사람이 직접 한다. 아래는 클릭 순서다.

## 1. 프로젝트 생성

1. https://supabase.com/dashboard 로그인(GitHub 계정 권장).
2. New project. Organization 은 개인 것 또는 새로 만든 DSL 조직.
3. 이름 `orbit-dev`, Database Password 는 새로 생성해 비밀번호 관리자에 저장(다시 볼 수 없다), Region `Northeast Asia (Seoul)`, Plan Free.
4. 생성이 끝나면(1~2분) 같은 순서로 `orbit-event` 를 하나 더 만든다. 행사용은 나중에 만들어도 되지만 Free 는 조직당 2개까지라 지금 만들어 두는 편이 낫다.

## 2. 스키마 적용 (orbit-dev 먼저)

1. 왼쪽 메뉴 SQL Editor → New query.
2. `supabase/migrations/0001_init.sql` 내용을 붙여 넣고 Run. 오류 없이 끝나야 한다.
3. 같은 방법으로 `0002_rls.sql` 실행.
4. 같은 방법으로 `0003_pin_nullable.sql` 실행.
5. 같은 방법으로 `supabase/seed.sql`, 이어서 `supabase/seed_dev_assign.sql` 실행(개발용만. `orbit-event` 에는 넣지 않는다).
6. SQL Editor 에서 `select * from current_tables;` 가 12행이면 끝. 로그인 시험용 숫자는 기존 10명 0000, 김민수(연세대) 1111, 김민수(고려대) 2222.

## 3. 키 확인

1. Project Settings → API.
2. `Project URL` 을 `SUPABASE_URL` 로, `service_role` 키를 `SUPABASE_SERVICE_ROLE_KEY` 로 쓴다.
3. `anon` 키는 지금 구조에서는 쓰지 않는다. 브라우저 코드에 어떤 키도 넣지 않는다.
4. 두 값은 저장소에 올리지 않는다. 팀원에게는 비밀 채널(카톡 1:1 또는 노션 비공개 페이지)로 전달하고, 행사 뒤 키를 재발급한다.

## 4. 팀원 초대

1. Organization settings → Team → Invite.
2. 팀원 이메일 4개, 역할 Developer(스키마 변경은 PR 로 하니 Owner 는 성하 혼자).
3. 초대 메일을 받은 팀원이 수락하면 대시보드에서 Table Editor 를 볼 수 있다.

## 5. 확인

로컬에서 `apps/web/.env.local` 을 채우고 `npm run dev` 뒤 `http://localhost:3000/api/health` 를 열면 `db: ok` 가 나와야 한다.

## 6. 스키마를 바꿀 때

새 파일 `supabase/migrations/0003_<설명>.sql` 을 만들고 PR 로 올린다. 병합 뒤 성하가 SQL Editor 에서 dev → event 순서로 실행한다. 기존 파일은 고치지 않는다.
