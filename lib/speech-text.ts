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

/** Do not narrate markup whose meaning can still change as tokens arrive. */
function stableNarration(text: string, final: boolean): string {
  let end = text.length;
  const fences = [...text.matchAll(/```/g)];
  if (fences.length % 2) end = Math.min(end, fences.at(-1)!.index!);
  const tag = text.lastIndexOf("{{");
  if (tag >= 0 && text.indexOf("}}", tag) < 0) end = Math.min(end, tag);
  const bracket = text.lastIndexOf("[");
  if (bracket >= 0) {
    const close = text.indexOf("]", bracket);
    if (close < 0 || (!final && close === text.length - 1)
      || (text[close + 1] === "(" && text.indexOf(")", close + 2) < 0)) {
      end = Math.min(end, bracket > 0 && text[bracket - 1] === "!" ? bracket - 1 : bracket);
    }
  }
  const html = text.lastIndexOf("<");
  if (html >= 0 && text.indexOf(">", html) < 0) end = Math.min(end, html);
  const prefix = text.slice(0, end);
  const plain = narrationText(prefix);
  return !final && plain && /\s$/.test(prefix) ? `${plain} ` : plain;
}

/** Consume cumulative visible reply snapshots once, with a small first passage. */
export class SpeechReplyBuffer {
  private consumed = "";
  private first = true;
  constructor(private limit = 500) {}

  take(text: string, final = false): string[] {
    if (text.length > 50_000) throw new Error("reply_limit");
    const plain = stableNarration(text, final);
    if (!plain.startsWith(this.consumed)) throw new Error("reply_changed");
    let remaining = plain.slice(this.consumed.length);
    const chunks: string[] = [];
    while (remaining.trim()) {
      const limit = this.first ? Math.min(180, this.limit) : this.limit;
      let length = 0;
      if (this.first) {
        // Avoid an extra provider request for a tiny introduction like "Sure."
        const sentence = [...remaining.matchAll(final ? /[.!?।](?=\s|$)/g : /[.!?।](?=\s)/g)]
          .find(match => match.index! + 1 >= 20 && match.index! + 1 <= limit);
        if (sentence) length = sentence.index! + 1;
      }
      if (!length && remaining.length >= limit) {
        const word = remaining.lastIndexOf(" ", limit);
        if (word >= limit / 2) length = word;
        else if (remaining.length > limit || final) length = speechChunks(remaining, limit)[0].length;
      }
      if (!length && final) length = remaining.length;
      if (!length) break;
      const chunk = remaining.slice(0, length);
      chunks.push(chunk);
      this.consumed += chunk;
      remaining = remaining.slice(length);
      this.first = false;
    }
    return chunks;
  }
}
