// Hard storage ceilings are independent of the process-local request throttle.
export const MAX_BUG_MEDIA_BYTES = 4 * 1024 * 1024;
export const MAX_BUG_REPORT_BODY_BYTES = Math.ceil(MAX_BUG_MEDIA_BYTES / 3) * 4 + 64 * 1024;
export const MAX_BUG_REPORTS = 50;
export const MAX_BUG_REPORTS_PER_DAY = 5;
export const MAX_BUG_STORED_MEDIA_BYTES = 16 * 1024 * 1024;

/** Validate canonical base64 plus the claimed file format, without decoding an image/video in memory. */
export function validBugReportMedia(data: unknown, type: unknown): data is string {
  if (typeof data !== "string" || data.length > MAX_BUG_REPORT_BODY_BYTES) return false;
  const match = /^data:(image\/(?:png|jpeg|gif|webp)|video\/(?:mp4|webm|quicktime));base64,/.exec(data);
  if (!match || type !== match[1].split("/")[0]) return false;
  const encoded = data.slice(match[0].length);
  if (!encoded.length || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) return false;
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length > MAX_BUG_MEDIA_BYTES || bytes.toString("base64") !== encoded) return false;
  switch (match[1]) {
    case "image/png": return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    case "image/jpeg": return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    case "image/gif": return ["GIF87a", "GIF89a"].includes(bytes.toString("ascii", 0, 6));
    case "image/webp": return bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
    case "video/webm": return bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
    default: return bytes.toString("ascii", 4, 8) === "ftyp";
  }
}
