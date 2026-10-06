# DB 스키마 설명 (v0, 2026-09-25)

정본은 `supabase/migrations/0001_init.sql` 이다. 이 문서는 표로 풀어 쓴 것이고, SQL 과 어긋나면 SQL 이 맞다. 스키마를 바꾸는 PR 은 두 파일을 같이 고친다.

## 원칙

1. 사람은 `participants.id`(uuid) 하나로만 식별한다. 이름은 표시용이다. 동명이인이 있다.
2. 계산 결과(배정, 추천)는 전부 `assign_versions.version` 을 달고 저장한다. 운영자가 `published` 로 바꿔야 참가자에게 보인다.
3. 주소(SID)는 행사 전날 한 번 발급하고 당일에 바꾸지 않는다(회의록 14). 커피챗 재배정은 점수만 다시 낸다.
4. 상호작용은 원본 그대로 쌓는다(명함 교환, 만족도, 스탬프, 화면 이벤트). 간선은 `edges` 뷰에서 파생한다.
5. 정답(`poster_quizzes.answer_index`)과 비밀번호 해시는 API 응답에 절대 넣지 않는다.
6. 브라우저는 DB 를 직접 부르지 않는다. RLS 는 켜 두고 정책은 없다(전부 거부). API Route 가 service_role 로만 접근한다.

## 테이블

| 테이블 | 무엇 | 누가 쓰나 | 비고 |
|---|---|---|---|
| participants | 참가자 기본 정보, 로그인 숫자 4자리의 해시(사전 적재 때 휴대폰 뒤 4자리 또는 무작위로 정함. null 이면 로그인 불가), 동의 시각, 고정 테이블 | 사전 적재(운영), 온보딩(consent_at), 운영 콘솔(login_pin_hash 재발급) | `is_host` 는 단방향 점수 대상, `is_admin` 은 콘솔. `fixed_table` 은 0008: 교수 · 운영진석처럼 미리 정한 테이블 번호(보통 1). 있으면 계산 서비스가 그 테이블에 고정한다. `teams` 도 0008: 같이 한 프로젝트 · 스터디 팀 이름 목록, 같으면 이미 아는 사이로 보고 추천에서 뒤로. `entry_token` 은 예비 |
| profiles | offer_text(하는 일), seek_text(찾는 사람), 주제 태그, 관계 태그, 링크 | 사전 적재, 온보딩 확인·수정 | 컬럼 이름은 have/want 로 바뀔 수 있다. 회의 확정 전 |
| sids | 주소 두 개와 벡터 두 개, 코드북 버전 | 계산 서비스(전날 배치) | 당일 재발급 없음 |
| labels | 주소 앞자리별 사람이 읽는 라벨 | 전날 배치, 운영 검수 | |
| checkins | 체크인 시각, 지연 여부 | 첫 로그인이 자동 기록, 운영 콘솔은 지연 표시·수동 추가 | 배정과 궤도는 체크인 명단만 쓴다 |
| assign_versions | 배정 버전(라운드, 상태, 파라미터, 행사 번호 event_id) | 계산 서비스 생성, 운영자 publish | event_id 는 0007. 행사가 섞인 개발 DB 에서도 자기 행사 배정만 본다 |
| codebooks | 주소(SID)를 정하는 기준표. 버전, 행사, 평균 벡터, 층별 대표 지점, 활성 여부 | 계산 서비스(전날 배치) | 0007. 행사마다 활성 하나. 체크인 마감 때 같은 기준으로 현장 등록자를 붙인다 |
| tables_meta | 테이블 라벨과 대화거리, 궤도용 대표 라벨 | 계산 서비스 | label 은 화면용(지금은 비움). orbit_prefix · orbit_label 은 0009, 궤도 화면 전용(v0.2 B-08) |
| table_members | 버전별 테이블 구성원, 좌석 번호(seat_no), 사람별 배정 이유(reason) | 계산 서비스 | reason 은 운영진 대시보드용. 참가자 화면에는 보내지 않는다(0006). seat_no 는 0008, 테이블토크만 채운다(원형 테이블 시계 방향 1부터) |
| pair_scores | 배정에 쓴 쌍 점수 원본 | 계산 서비스 | 정확도 채점용. 재계산하지 않는다. score_no_poster 는 0009, 포스터 반영 없이 낸 점수(커피챗만) |
| recs | 개인 추천(순위, 상대, 이유) | 계산 서비스 | 전날 계산(테이블토크 버전)과 커피챗 계산(커피챗 버전) 두 번 만든다. 생성 시점은 version 의 round 로 안다(v0.2 B-06) |
| group_reasons | 커피챗 그룹 구성원 카드의 근거 한 줄(보는 사람 → 상대) | 계산 서비스 | 0009. 근거가 없는 쌍은 행이 없다(v0.2 B-07) |
| card_exchanges | 명함 교환 기록(방향 있음). `source` qr·manual 은 찍은 쪽, auto 는 받은 쪽. `seen_at` 은 받은 쪽 알림 확인 시각 | card 모듈 API | 한 번 찍으면 두 행(양방향, 9/26 확정). 교환 수는 행 수 그대로(교환 1건 = 각자 +1, 전체 +2) |
| satisfaction | 테이블토크 끝 만족도. 문장 선택지 choice(gained, different, unsure, mismatch)와 한 줄 의견 | tabletalk 모듈 API | 라운드당 1건. 0005 에서 1~5 숫자를 선택지로 바꿨다 |
| event_log | 화면 이벤트(열람, 스캔 실패 등) | 모든 모듈 API | 패시브 수집 |
| posters | 포스터 목록과 QR 코드, 요약 한 줄(summary), 발표자 참가자 id(presenter_ids) | 사전 적재 | summary · presenter_ids 는 0009. 포스터 벡터 = 제목 + tags + summary, 발표자 본인 · 같은 소속 응답은 계산에서 뺀다 |
| poster_quizzes | 포스터별 퀴즈와 정답 | 사전 적재 | 정답은 서버만 본다 |
| quiz_attempts | 퀴즈 시도 기록 | poster 모듈 API | 오답도 남긴다 |
| stamps | 포스터 스탬프 | poster 모듈 API | 포스터당 1개. v0.2 부터는 관심 이유를 내면 찍힌다(퀴즈 정답과 무관, /api/poster/response) |
| poster_interest | 포스터 관심도. 문장 선택지 choice(learn_more, interesting, not_mine) | poster 모듈 API | 0005 에서 1~5 숫자를 선택지로 바꿨다. v0.2 부터는 poster_responses 를 쓴다(운영 콘솔 포스터 칸이 아직 읽어 남겨 둠) |
| poster_responses | 포스터 관심 이유(미션 ①). reason(topic, method, experience, new_field), 보여 준 순서, 소요 시간, 응답 순번, 퀴즈 시도 | poster 모듈 API | 0009. 계산 서비스가 B-05 전처리 뒤 커피챗에 반영(docs/DATA_SPEC.md) |
| raffle_tickets | 응모권 | poster 모듈 API | v0.2 결정 6 으로 앱에서 발급하지 않는다(명찰 번호로 앱 밖). 표와 운영 콘솔 추첨은 남아 있다 |
| ops_state | 운영 상태(phase, 공개 버전, 계산 서비스 생존 신호) | 운영 콘솔, 계산 서비스 | |
| chat_logs | 챗봇 질문 기록(횟수 제한) | P2 | |

## 뷰

| 뷰 | 내용 |
|---|---|
| edges | 명함 교환을 무방향 간선(가중치 0.3)으로 묶은 것. 같은 테이블 이력은 간선이 아니다 |
| current_tables | 라운드 · 행사별 최신 published 배정. 화면은 이 뷰만 본다(0007 에서 event_id, 0008 에서 seat_no 칸 추가) |

## 모듈별로 쓰는 테이블

| 모듈 | 읽기 | 쓰기 |
|---|---|---|
| onboarding | participants(핀 검증), current_tables | participants.consent_at, event_log |
| home | profiles, sids, labels, current_tables | event_log |
| card | participants, profiles(공개 범위 적용), card_exchanges | card_exchanges, event_log |
| tabletalk | current_tables(tabletalk), profiles, tables_meta | satisfaction(tabletalk · coffeechat), event_log |
| coffeechat | current_tables(coffeechat), recs, tables_meta, group_reasons | event_log |
| poster | posters, poster_quizzes(정답 제외), stamps, raffle_tickets, poster_responses | quiz_attempts, stamps, poster_responses, poster_interest(예전 화면), event_log |
| ops(콘솔) | 전부 | checkins, assign_versions.status, ops_state |
| compute | participants, profiles, checkins, card_exchanges, satisfaction, posters, poster_responses, poster_interest(응답이 없을 때), labels | sids, labels, codebooks, assign_versions, tables_meta, table_members, pair_scores, recs, group_reasons, ops_state |

## 미정이라 보류한 것

| 항목 | 지금 상태 | 정하면 할 일 |
|---|---|---|
| SID 두 개의 이름(have/want 대 offer/seek) | offer/seek | 컬럼 rename 마이그레이션 1개 |
| 각 SID 에 넣을 정보 범위 | offer 는 하는 일 + 주제 태그, seek 는 찾는 사람 + 관계 태그 | 계산 서비스 문장 틀 수정 |
| 응모권 조건 | 설정값 미정 | `services/compute` 아님. poster API 설정값 |
