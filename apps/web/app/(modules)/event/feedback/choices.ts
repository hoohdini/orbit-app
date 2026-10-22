// 행사 후기 화면의 선택지(피그마 R-1 ~ R-3). 태그 키는 서버(/api/event/feedback)가 받는 값과 같고 문구만 화면용이다. 만족도는 3단계(1 별로였다 · 2 좋았다 · 3 최고였다)
export const FEEDBACK_TAGS: { key: string; label: string }[] = [
  { key: "card_exchange", label: "명함 교환" },
  { key: "recommended", label: "추천 인물" },
  { key: "mission_stamp", label: "미션·스탬프" },
  { key: "qr_scan", label: "QR 스캔" },
  { key: "layout", label: "화면 구성" },
  { key: "speed", label: "속도·안정성" },
  { key: "notification", label: "알림" },
];
export const RATINGS: { value: number; icon: string; label: string }[] = [
  { value: 3, icon: "👍👍", label: "최고였다" },
  { value: 2, icon: "👍", label: "좋았다" },
  { value: 1, icon: "👎", label: "별로였다" },
];
export const ratingLabel = (v: number) => RATINGS.find((r) => r.value === v)?.label ?? "";
export const COMMENT_MAX = 100;
export const tagLabel = (key: string) => FEEDBACK_TAGS.find((t) => t.key === key)?.label ?? key;
