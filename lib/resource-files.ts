/**
 * Shared constants for tutor-uploaded lesson resource files (PDFs, text docs,
 * etc.), stored in the `resource_files` table and served from
 * /api/resources/[id]. Single source of truth so the upload route, the
 * download route, course-catalog validation, and the tutor upload UI can't
 * drift out of sync on limits or the allowed file types.
 */

export const MAX_RESOURCE_FILE_BYTES = 10 * 1024 * 1024; // 10 MB, decoded

// Base64 inflates by ~4/3; leave headroom for the JSON wrapper and the
// data: URL prefix around the encoded payload.
export const MAX_RESOURCE_UPLOAD_BODY_BYTES = Math.ceil(MAX_RESOURCE_FILE_BYTES * 1.4) + 4_096;

export const ALLOWED_RESOURCE_MIME_TYPES: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "text/plain": [".txt"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/vnd.ms-powerpoint": [".ppt"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
  "application/vnd.ms-excel": [".xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
};

export const RESOURCE_FILE_ACCEPT = Object.values(ALLOWED_RESOURCE_MIME_TYPES).flat().join(",");

const RESOURCE_FILE_ID_PATTERN = /^[a-f0-9]{32}$/;

export function isValidResourceFileId(id: string): boolean {
  return RESOURCE_FILE_ID_PATTERN.test(id);
}

export function resourceFileUrl(id: string): string {
  return `/api/resources/${id}`;
}

/** Matches urls produced by resourceFileUrl() — used by course-catalog validation. */
export function isResourceFileUrl(value: string): boolean {
  const match = /^\/api\/resources\/([a-f0-9]{32})$/.exec(value);
  return match !== null;
}