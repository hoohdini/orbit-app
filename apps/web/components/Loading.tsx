export default function Loading({ text = "불러오는 중" }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-500">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-black" />
      <span className="text-sm">{text}</span>
    </div>
  );
}
