-- 2026-09-26. 명함 교환을 양방향으로 바꾼다(회의 결정: 한쪽이 찍어도 서로 주고받는다).
-- 스캔 1건 = card_exchanges 2행. 찍은 쪽 행은 source qr 또는 manual, 받은 쪽 행은 auto.
-- 받은 쪽 행의 seen_at 이 null 이면 "OO 님에게 명함이 공유되었습니다" 알림을 아직 보지 않은 것이다.
-- 교환 수 집계는 행 수 그대로다(교환 1건 = 각자 +1, 전체 +2). 2로 나누지 않는다.
-- edges 뷰는 least/greatest 로 묶으므로 그대로 둔다. 계산 서비스는 손댈 것이 없다.

alter table card_exchanges
  add column source  text not null default 'qr' check (source in ('qr','manual','auto')),
  add column seen_at timestamptz;

create index card_exchanges_inbox on card_exchanges (scanner_id) where source = 'auto' and seen_at is null;
