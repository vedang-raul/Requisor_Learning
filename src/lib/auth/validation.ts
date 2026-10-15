const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** True only for real calendar dates encoded exactly as YYYY-MM-DD. */
export function isIsoCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}