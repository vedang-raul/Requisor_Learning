import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { createRateLimiter, rateLimitResponse } from "@/lib/rate-limit";
import { InvalidJsonBodyError, readJsonBody, RequestBodyTooLargeError } from "@/lib/request-body";
import {
  ALLOWED_RESOURCE_MIME_TYPES,
  MAX_RESOURCE_FILE_BYTES,
  MAX_RESOURCE_UPLOAD_BODY_BYTES,
  resourceFileUrl,
} from "@/lib/resource-files";

const canManage = (role: unknown) => role === "admin" || role === "tutor";
const uploadLimiter = createRateLimiter(30, 15 * 60_000);

const DATA_URL_PATTERN = /^data:([a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/]+=*)$/;

function sanitizeFilename(name: string): string {
  // Strip any path components and control characters; keep it a plain label.
  const base = name.split(/[\\/]/).pop() ?? name;
  return base.replace(/[\x00-\x1f\x7f]/g, "").trim().slice(0, 200);
}

function hasAllowedExtension(filename: string, mimeType: string): boolean {
  const extension = filename.toLowerCase().match(/\.[a-z0-9]+$/)?.[0];
  return !!extension && ALLOWED_RESOURCE_MIME_TYPES[mimeType].includes(extension);
}

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManage(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { limited, retryAfterMs } = uploadLimiter.check(session.user.email ?? session.user.id);
  if (limited) return rateLimitResponse(retryAfterMs, { json: true });

  try {
    const body = await readJsonBody(req, MAX_RESOURCE_UPLOAD_BODY_BYTES);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }
    if (Object.keys(body).some((key) => key !== "filename" && key !== "dataUrl")) {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }
    const { filename, dataUrl } = body as Record<string, unknown>;
    if (typeof filename !== "string" || !filename.trim() || filename.length > 200 || typeof dataUrl !== "string") {
      return NextResponse.json({ error: "A filename and file data are required." }, { status: 400 });
    }

    const match = DATA_URL_PATTERN.exec(dataUrl);
    if (!match) return NextResponse.json({ error: "Invalid file data." }, { status: 400 });
    const [, mimeType, base64] = match;
    if (!Object.prototype.hasOwnProperty.call(ALLOWED_RESOURCE_MIME_TYPES, mimeType)) {
      return NextResponse.json({ error: "That file type isn't supported." }, { status: 400 });
    }
    if (base64.length % 4 !== 0) return NextResponse.json({ error: "Invalid file data." }, { status: 400 });
    const data = Buffer.from(base64, "base64");
    if (data.length === 0 || data.length > MAX_RESOURCE_FILE_BYTES || data.toString("base64") !== base64) {
      return NextResponse.json({ error: "File must be between 1 byte and 10 MB." }, { status: 400 });
    }

    const cleanFilename = sanitizeFilename(filename);
    if (!cleanFilename || cleanFilename !== filename.trim() || !hasAllowedExtension(cleanFilename, mimeType)) {
      return NextResponse.json({ error: "Filename must be safe and match the file type." }, { status: 400 });
    }
    const id = crypto.randomBytes(16).toString("hex");
    await db.query(
      `INSERT INTO resource_files (id, owner_user_id, filename, mime_type, size_bytes, data)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, Number(session.user.id), cleanFilename, mimeType, data.length, data]
    );

    return NextResponse.json(
      { id, url: resourceFileUrl(id), filename: cleanFilename, mimeType, sizeBytes: data.length },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return NextResponse.json({ error: "File is too large (max 10 MB)." }, { status: 413 });
    if (error instanceof InvalidJsonBodyError) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    console.error(JSON.stringify({ operation: "tutor.resource-files.upload", requestId, error: error instanceof Error ? error.message : "unknown" }));
    return NextResponse.json({ error: "Unable to upload file." }, { status: 500 });
  }
}
