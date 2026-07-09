// Diagonal "merge" arrow shown for a lane_closed_ahead matrix display.
// Drawn pointing down-right; mirrored horizontally when merging left.
export default function MergeArrow({
  merge,
  className = "h-4 w-4 text-amber-400",
}: {
  merge: "left" | "right" | null;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={merge === "left" ? { transform: "scaleX(-1)" } : undefined}
      aria-hidden="true"
    >
      <path d="M7 7 17 17" />
      <path d="M17 10.5 17 17 10.5 17" />
    </svg>
  );
}
