# 협업 규칙: 구역 나누기와 PR (2026-10-06)

모두가 에이전트로 코드를 쓰는 팀이라, 두 사람이 같은 파일을 고치면 PR 충돌이 난다. 그래서 사람이 아니라 폴더로 일을 나눈다. 브랜치 이름의 앞부분이 그 PR 이 고쳐도 되는 폴더를 정하고, GitHub 의 구역 검사가 이를 자동으로 확인한다. 에이전트용 같은 규칙은 저장소 맨 위 `AGENTS.md` 에 있다.

## 1. 역할과 흐름

```
디자인(나혜 · 현희)   피그마 화면 · 프로토타입. 코드는 고치지 않는다
        │  피그마 링크, 화면별 상태(빈 화면, 로딩, 오류)
        ▼
프론트(수민)          fe/ 브랜치. 화면 폴더만 고친다
        │  docs/API.md 의 응답 모양으로 /api/... 를 부른다
        ▼
백엔드(성하)          be/ 브랜치. API · lib · DB 스키마 · 문서
        ▲
계산 서비스(민찬)      compute/ 브랜치. services/compute
```

머지는 성하가 한다. 화면과 API 사이의 약속은 `docs/API.md` 한 곳이다.

## 2. 구역 표

| 브랜치 | 고쳐도 되는 곳 | 주 담당 |
|---|---|---|
| `fe/...` | `apps/web/app/(modules)/`, `apps/web/components/`, `apps/web/public/`, `apps/web/app/` 바로 아래 `globals.css` · `layout.tsx` · `page.tsx` · `logout/` · `dev/` | 수민 |
| `be/...` | `apps/web/app/api/`, `apps/web/lib/`, `supabase/`, `scripts/`, `docs/` | 성하(민찬 모듈 API 는 민찬도) |
| `compute/...` | `services/compute/`, `docs/` | 민찬 |
| `docs/...` | `docs/`, `README.md` | 누구나 |
| `setup/...` | 전부 | 성하만 |

공용 파일(`package.json`, `package-lock.json`, 설정 파일, `.github/`, `AGENTS.md`, `CLAUDE.md`)은 `setup/` 에서만 고친다. 패키지 설치가 필요하면 PR 설명에 적어 성하에게 부탁한다.

예외가 꼭 필요하면 성하가 PR 에 `구역-예외` 라벨을 붙인다. 검사 규칙은 `.github/scripts/check_zones.py` 이고, 표를 바꾸면 그 파일과 `AGENTS.md` 도 같이 고친다.

## 3. 작업 한 건의 순서

업무분담 시트의 업무 ID 하나가 PR 하나다. 가능하면 하루 안에 PR 까지 낸다. 오래 붙잡은 브랜치일수록 충돌이 커진다.

```bash
# 1) 최신 main 에서 시작
git switch main
git pull

# 2) 구역과 업무 ID 로 브랜치 만들기
git switch -c fe/h05-scan-result

# 3) 에이전트로 작업 (첫 메시지 예시는 6절)

# 4) 검사 (apps/web 에서)
cd apps/web
npx next typegen && npx tsc --noEmit
npm run lint
cd ../..

# 5) 의도하지 않은 파일이 바뀌지 않았는지 보기
git status
git checkout -- apps/web/package-lock.json   # 잠금 파일이 바뀌어 있으면 되돌린다

# 6) 커밋 · push · PR
git add -A
git commit -m "H-05-FE 교환 결과 화면"
git push -u origin fe/h05-scan-result
```

push 뒤 GitHub 에서 PR 을 열고 양식을 채운다. 구역 검사와 웹 검사가 초록이 되면 성하가 머지한다.

## 4. 화면과 API 를 잇는 순서 (API 먼저)

1. 백엔드가 `docs/API.md` 에 한 줄을 쓰고, 가짜 데이터를 돌려주는 라우트를 먼저 머지한다(be/ PR).
2. 프론트는 그 라우트를 부르며 화면을 만든다. 라우트가 아직 없으면 모듈 폴더 안 `mock.ts` 의 가짜 데이터로 먼저 만든다.
3. 백엔드가 라우트 안을 진짜 로직으로 바꾼다. 응답 모양이 같으므로 화면은 고칠 필요가 없다.

응답 모양을 바꿔야 하면 API.md 를 먼저 고치고 팀에 알린다.

## 5. 충돌이 났을 때

PR 에 This branch has conflicts 가 뜨면:

```bash
git switch 내-브랜치
git pull origin main
```

- 충돌 파일이 내 구역이면 에이전트에게 main 쪽 변경은 살리고 내 변경을 그 위에 다시 얹어 달라고 한다. 고친 뒤 검사를 다시 돌리고 커밋 · push 한다.
- 충돌 파일이 내 구역 밖이면 그 파일은 main 것으로 돌린다: `git checkout origin/main -- 파일경로`.
- 모르겠으면 그대로 두고 성하에게 PR 링크를 보낸다. 억지로 해결하지 않는다.

성하는 be/ 를 먼저, fe/ 를 나중에 머지한다. 머지 뒤 다른 PR 에 충돌이 뜨면 작성자에게 위 명령을 부탁한다.

## 6. 에이전트에게 주는 첫 메시지 예시

```
브랜치는 fe/h05-scan-result 다. AGENTS.md 의 구역 규칙을 지킨다.
업무: 업무분담 시트 H-05-FE (공용 스캐너 QR 분기, 교환 결과 화면, 본인 · 중복 · 미인식 안내).
피그마: (링크)
쓸 API: docs/API.md 의 /api/card/scan. 필요한데 없는 API 는 만들지 말고 mock.ts 로 두고 마지막에 목록으로 알려 줘.
끝나면 apps/web 에서 next typegen, tsc, lint 를 돌리고 결과를 보고해.
```

## 7. GitHub 설정 (성하가 한 번)

저장소 Settings 에서:

1. Branches → Add branch ruleset(또는 protection rule), 대상 `main`
   - Require a pull request before merging 켜기. 승인 수는 0(성하가 머지 담당이라 승인 필수는 끈다)
   - Require status checks to pass 켜고 `구역 검사`, `웹 검사` 추가(이 PR 이 머지되고 PR 하나가 검사를 돈 뒤에 목록에 뜬다)
   - Block force pushes 켜기
2. General → Pull Requests → Automatically delete head branches 켜기
3. Issues → Labels 에 `구역-예외` 라벨 만들기
4. 수민 GitHub 아이디를 받으면 `.github/CODEOWNERS` 의 프론트 줄 주석을 푼다(setup/ PR)
