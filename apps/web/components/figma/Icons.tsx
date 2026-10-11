// 피그마 gathering-UI 의 아이콘(Component 페이지 IconTile · TabBar · Header). 선 색은 currentColor 라서 글자색으로 바꾼다.
type P = { className?: string };
const base = { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round" } as const;

export function IconHome({ className }: P) {
  return (
    <svg {...base} strokeWidth={1.8} className={className} aria-hidden>
      <path d="M4 10.5L12 4L20 10.5V19C20 19.55 19.55 20 19 20H14.5V14.5H9.5V20H5C4.45 20 4 19.55 4 19V10.5Z" />
    </svg>
  );
}

export function IconPeople({ className }: P) {
  return (
    <svg {...base} strokeWidth={1.8} className={className} aria-hidden>
      <path d="M9 12.2C10.77 12.2 12.2 10.77 12.2 9C12.2 7.23 10.77 5.8 9 5.8C7.23 5.8 5.8 7.23 5.8 9C5.8 10.77 7.23 12.2 9 12.2Z" />
      <path d="M3.5 19C4.1 16 6.3 14.4 9 14.4C11.7 14.4 13.9 16 14.5 19" />
      <path d="M17 10.4C18.33 10.4 19.4 9.33 19.4 8C19.4 6.67 18.33 5.6 17 5.6C15.67 5.6 14.6 6.67 14.6 8C14.6 9.33 15.67 10.4 17 10.4Z" />
      <path d="M16.8 13.4C18.8 13.6 20.1 15 20.5 17.2" />
    </svg>
  );
}

export function IconFlag({ className }: P) {
  return (
    <svg {...base} strokeWidth={1.8} className={className} aria-hidden>
      <path d="M6 20V4.5" />
      <path d="M6 5H17L14.6 8.6L17 12.5H6" />
    </svg>
  );
}

export function IconUser({ className }: P) {
  return (
    <svg {...base} strokeWidth={1.8} className={className} aria-hidden>
      <path d="M12 12.1C13.99 12.1 15.6 10.49 15.6 8.5C15.6 6.51 13.99 4.9 12 4.9C10.01 4.9 8.4 6.51 8.4 8.5C8.4 10.49 10.01 12.1 12 12.1Z" />
      <path d="M5 20C5.8 16.4 8.6 14.6 12 14.6C15.4 14.6 18.2 16.4 19 20" />
    </svg>
  );
}

export function IconScan({ className }: P) {
  return (
    <svg {...base} strokeWidth={1.7} className={className} aria-hidden>
      <path d="M4 8V5.5C4 4.67 4.67 4 5.5 4H8M16 4H18.5C19.33 4 20 4.67 20 5.5V8M20 16V18.5C20 19.33 19.33 20 18.5 20H16M8 20H5.5C4.67 20 4 19.33 4 18.5V16M4 12H20" />
    </svg>
  );
}

export function IconQr({ className }: P) {
  return (
    <svg {...base} strokeWidth={1.7} className={className} aria-hidden>
      <rect x="4" y="4" width="6" height="6" rx="1.2" />
      <rect x="14" y="4" width="6" height="6" rx="1.2" />
      <rect x="4" y="14" width="6" height="6" rx="1.2" />
      <path d="M14.5 14.5H16.5V16.5H14.5V14.5ZM18 18H20V20H18V18Z" />
    </svg>
  );
}

export function IconBack({ className }: P) {
  return (
    <svg {...base} strokeWidth={1.8} className={className} aria-hidden>
      <path d="M14.5 5L8 12L14.5 19" />
    </svg>
  );
}

export function IconClose({ className }: P) {
  return (
    <svg {...base} strokeWidth={2} className={className} aria-hidden>
      <path d="M6 6L18 18M18 6L6 18" />
    </svg>
  );
}

export function IconChevron({ className, dir = "left" }: P & { dir?: "left" | "right" }) {
  return (
    <svg width="7" height="13" viewBox="0 0 6.8 12.8" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden style={dir === "right" ? { transform: "scaleX(-1)" } : undefined}>
      <path d="M5.9 0.9L0.9 6.4L5.9 11.9" />
    </svg>
  );
}
