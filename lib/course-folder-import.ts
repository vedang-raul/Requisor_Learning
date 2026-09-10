import { createZip, type ZipInputEntry } from "@/lib/zip-writer";

export const MAX_COURSE_IMPORT_BYTES = 200 * 1024 * 1024;
const MAX_FOLDER_FILES = 2_000;

export async function courseFolderToZip(files: FileList | File[]): Promise<ArrayBuffer> {
  const selected = Array.from(files).filter((file) => file.size > 0);
  if (!selected.length) throw new Error("The selected folder is empty.");
  if (selected.length > MAX_FOLDER_FILES) throw new Error("The selected folder contains too many files.");

  const totalBytes = selected.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > MAX_COURSE_IMPORT_BYTES) throw new Error("Course import folders must be 200 MB or smaller.");

  const entries: ZipInputEntry[] = await Promise.all(selected.map(async (file) => {
    const relativePath = file.webkitRelativePath || file.name;
    const parts = relativePath.replace(/\\/g, "/").split("/").filter(Boolean);
    const path = parts.length > 1 ? parts.slice(1).join("/") : parts[0];
    if (!path || path.split("/").some((part) => part === "." || part === "..")) {
      throw new Error("The selected folder contains an invalid file path.");
    }
    return { name: path, data: new Uint8Array(await file.arrayBuffer()) };
  }));

  const zip = await createZip(entries);
  return zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer;
}