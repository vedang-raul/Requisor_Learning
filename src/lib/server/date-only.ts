/**
 * A DATE column as "YYYY-MM-DD". node-postgres turns DATE into a Date at local
 * midnight, so toISOString() would give the previous day on a server whose
 * timezone is ahead of UTC; read the local calendar date instead.
 */
export function dateOnly(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === "string") return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
  if (isNaN(value.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}
