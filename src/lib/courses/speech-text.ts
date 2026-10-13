/** Prepare visible assistant text for narration, not action frames or chat history. */
export function narrationText(text: string): string {
  return text
    .replace(/\{\{(?:course|lesson)\|[^|}]+\|([^}]+)\}\}/g, "$1")
    .replace(/```[\s\S]*?```/g, " Code example omitted from narration. ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]*>/g, "")
    .replace(/[*_`#]/g, "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Keep provider requests short; retain every character and prefer word boundaries. */
export function speechChunks(text: string, limit = 500): string[] {
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > limit) {
    let end = remaining.lastIndexOf(" ", limit);
    if (end < limit / 2) end = limit;
    // Never separate a UTF-16 surrogate pair.
    if (/[\uD800-\uDBFF]/.test(remaining[end - 1])) end--;
    chunks.push(remaining.slice(0, end));
    remaining = remaining.slice(end);
  }
  if (remaining.trim()) chunks.push(remaining);
  return chunks;
}
