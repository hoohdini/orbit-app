// 빈 상태 문구 초안(할 일 28). 화면마다 문장을 따로 쓰지 않고 여기서 골라 EmptyState 에 넘긴다.
// 확정 전 초안이다. 문구를 바꿀 때는 이 파일만 고친다
export type EmptyCopy = { title: string; body?: string; action?: { href: string; label: string } };

export const EMPTY = {
  walletNone: { title: "아직 교환한 명함이 없습니다", body: "처음 만난 분과 서로의 QR 을 찍으면 여기에 쌓입니다", action: { href: "/card/scan?via=card", label: "명함 스캔하기" } },
  walletFilter: { title: "여기에 해당하는 명함이 없습니다", body: "다른 칩을 눌러 보세요" },
  searchNone: { title: "입장한 사람 중에 없습니다", body: "이름을 다시 확인하거나 운영진에게 문의해 주세요" },
  recsNone: { title: "아직 추천할 분이 없습니다", body: "추천은 배정이 공개되면 채워집니다" },
  tableNotYet: { title: "아직 테이블이 공개되지 않았습니다", body: "사회자 안내 뒤에 자리가 보입니다" },
  groupNotYet: { title: "아직 커피챗 테이블이 공개되지 않았습니다", body: "테이블토크가 끝나면 새 테이블이 공개됩니다" },
  missionNone: { title: "진행 중인 미션이 없습니다", body: "행사가 시작되면 미션이 열립니다" },
  stampNone: { title: "아직 모은 스탬프가 없습니다", body: "포스터 QR 을 찍고 퀴즈를 풀면 스탬프가 찍힙니다" },
  offerEmpty: { title: "Offer 가 비어 있습니다", body: "내가 도울 수 있는 것을 한 줄로 적어 주세요" },
  seekEmpty: { title: "Seek 가 비어 있습니다", body: "오늘 만나고 싶은 사람을 한 줄로 적어 주세요" },
  linksEmpty: { title: "등록된 링크가 없습니다" },
  noticeNone: { title: "새 공지가 없습니다" },
} satisfies Record<string, EmptyCopy>;
