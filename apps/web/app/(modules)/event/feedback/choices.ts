// ORBIT.app 피드백 화면의 선택지(피그마 R-1 ~ R-3, 10/21). 키는 서버가 저장할 값이고 문구만 화면용이다. 키 이름은 be/ 가 정하면 맞춘다
export const FEEDBACK_TAGS: { key: string; label: string }[] = [
  { key: "card_exchange", label: "명함 교환" },
  { key: "recommended", label: "추천 인물" },
  { key: "mission_stamp", label: "미션·스탬프" },
  { key: "qr_scan", label: "QR 스캔" },
  { key: "layout", label: "화면 구성" },
  { key: "speed", label: "속도·안정성" },
  { key: "notification", label: "알림" },
];
export const RATINGS = [1, 2, 3, 4, 5];
export const COMMENT_MAX = 100;
export const tagLabel = (key: string) => FEEDBACK_TAGS.find((t) => t.key === key)?.label ?? key;
