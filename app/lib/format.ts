// Shared display formatting helpers.

// NDW feed timestamps are ISO 8601 (UTC or with offset). Render them in Dutch
// locale and Europe/Amsterdam time, e.g. "12 jul 2026 13:20". Returns undefined
// for empty input and falls back to the raw string if it can't be parsed.
const DATE_TIME_FORMAT = new Intl.DateTimeFormat("nl-NL", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Amsterdam",
});

export function formatDateTime(value?: string | null): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return DATE_TIME_FORMAT.format(date);
}
