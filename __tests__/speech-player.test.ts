import { SpeechPlayer, type SpeechPlaybackState } from "@/lib/speech-player";
import { readSpeechPreferences, writeSpeechPreferences, speechPreferenceKey } from "@/lib/speech-preferences";
import { narrationText, speechChunks, SpeechReplyBuffer } from "@/lib/speech-text";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
const audioResponse = () => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "audio/mpeg" } });
function harness() {
  const states: SpeechPlaybackState[] = [];
  const audios: HTMLAudioElement[] = [];
  const createAudio = jest.fn(() => {
    const a = {
      play: jest.fn(async () => undefined), pause: jest.fn(), load: jest.fn(), removeAttribute: jest.fn(),
      onplaying: null, onended: null, onerror: null, onpause: null,
    } as unknown as HTMLAudioElement;
    audios.push(a); return a;
  });
  const deps = {
    fetch: jest.fn(async () => audioResponse()) as jest.Mock,
    createAudio, createUrl: jest.fn(() => "blob:test"), revokeUrl: jest.fn(),
  };
  const player = new SpeechPlayer(deps, s => states.push(s));
  return { player, deps, states, audios };
}
describe("speech playback lifecycle", () => {
  it("starts the first sentence before the reply finishes and never repeats it on completion", async () => {
    const h = harness();
    const first = "This sentence can be narrated early.";
    const full = `${first} The rest of the answer is still being written.`;
    h.player.beginReply("marathi-male", 300);
    h.player.updateReply(`${first} `);
    expect(JSON.parse(h.deps.fetch.mock.calls[0][1].body)).toEqual({ voiceKey: "marathi-male", text: first });
    await new Promise(r => setTimeout(r, 0));
    h.player.updateReply(full, true);
    await new Promise(r => setTimeout(r, 0));
    expect(h.audios).toHaveLength(1);
    h.audios[0].onended?.(new Event("ended"));
    await new Promise(r => setTimeout(r, 0));
    expect(h.audios).toHaveLength(2);
    expect(h.deps.fetch.mock.calls.map(call => JSON.parse(call[1].body).text).join("")).toBe(full);
    h.audios[1].onended?.(new Event("ended"));
    h.player.updateReply(full, true);
    expect(h.deps.fetch).toHaveBeenCalledTimes(2);
  });
  it("preloads exactly one next passage while current audio plays, without changing speaking feedback", async () => {
    const h = harness();
    await h.player.speak("A helpful lesson explanation. ".repeat(100), "guide");
    h.audios[0].onplaying?.(new Event("playing"));
    await new Promise(r => setTimeout(r, 0));
    expect(h.deps.fetch).toHaveBeenCalledTimes(2);
    expect(h.audios).toHaveLength(1);
    expect(h.states.at(-1)).toEqual({ loading: false, isSpeaking: true, error: null });
    h.audios[0].onended?.(new Event("ended"));
    await new Promise(r => setTimeout(r, 0));
    expect(h.audios).toHaveLength(2);
    expect(h.deps.fetch).toHaveBeenCalledTimes(3);
    h.player.stop();
  });
  it("keeps current audio playing when prefetch fails, then reports a safe error for the next passage", async () => {
    const h = harness();
    h.deps.fetch.mockResolvedValueOnce(audioResponse()).mockResolvedValueOnce(new Response("private provider detail", { status: 502 }));
    await h.player.speak("A helpful lesson explanation. ".repeat(40), "guide");
    h.audios[0].onplaying?.(new Event("playing"));
    await new Promise(r => setTimeout(r, 0));
    expect(h.states.at(-1)?.isSpeaking).toBe(true);
    h.audios[0].onended?.(new Event("ended"));
    await new Promise(r => setTimeout(r, 0));
    expect(h.audios).toHaveLength(1);
    expect(h.states.at(-1)?.error).toContain("unavailable");
    expect(h.states.at(-1)?.error).not.toContain("private");
  });
  it("ignores old audio events after advancing within the same streamed reply", async () => {
    const h = harness();
    await h.player.speak("A helpful lesson explanation. ".repeat(60), "guide");
    const first = h.audios[0], ended = first.onended, paused = first.onpause;
    ended?.call(first, new Event("ended"));
    await new Promise(r => setTimeout(r, 0));
    h.audios[1].onplaying?.(new Event("playing"));
    const count = h.deps.fetch.mock.calls.length;
    ended?.call(first, new Event("ended"));
    paused?.call(first, new Event("pause"));
    expect(h.audios).toHaveLength(2);
    expect(h.deps.fetch).toHaveBeenCalledTimes(count);
    expect(h.states.at(-1)?.isSpeaking).toBe(true);
    h.player.stop();
  });
  it.each(["stop", "mute", "switch voice", "account change", "close chat"])("cancels prefetched audio and ignores subsequent reply tokens after %s", async () => {
    const h = harness(), pending = deferred<Response>();
    h.deps.fetch.mockReturnValueOnce(Promise.resolve(audioResponse())).mockReturnValueOnce(pending.promise);
    const full = "A helpful lesson explanation. ".repeat(50).trim();
    h.player.beginReply("guide");
    h.player.updateReply(full);
    await new Promise(r => setTimeout(r, 0));
    expect(h.deps.fetch).toHaveBeenCalledTimes(2);
    const signal = h.deps.fetch.mock.calls[1][1].signal;
    const ended = h.audios[0].onended;
    h.player.stop();
    expect(signal.aborted).toBe(true);
    pending.resolve(audioResponse());
    h.player.updateReply(full, true);
    ended?.call(h.audios[0], new Event("ended"));
    await new Promise(r => setTimeout(r, 0));
    expect(h.audios).toHaveLength(1);
    expect(h.deps.fetch).toHaveBeenCalledTimes(2);
    expect(h.states.at(-1)).toEqual({ loading: false, isSpeaking: false, error: null });
  });
  it("uses keys only and drives speaking feedback from actual playback events", async () => {
    const h = harness();
    await h.player.play("preview", "guide");
    expect(JSON.parse(h.deps.fetch.mock.calls[0][1].body)).toEqual({ contentKey: "preview", voiceKey: "guide" });
    expect(h.states.at(-1)).toEqual({ loading: true, isSpeaking: false, error: null });
    h.audios[0].onplaying?.(new Event("playing"));
    expect(h.states.at(-1)?.isSpeaking).toBe(true);
    h.audios[0].onended?.(new Event("ended"));
    expect(h.states.at(-1)?.isSpeaking).toBe(false);
    expect(h.deps.revokeUrl).toHaveBeenCalledWith("blob:test");
  });
  it("reads an entire long reply in sequence and clears the remaining queue on stop", async () => {
    const h = harness();
    const text = "A helpful lesson explanation. ".repeat(50).trim();
    const chunks = speechChunks(text);
    expect(chunks.join("")).toBe(text);
    await h.player.speak(text, "marathi-male");
    for (let i = 0; i < chunks.length; i++) {
      expect(JSON.parse(h.deps.fetch.mock.calls[i][1].body)).toEqual({ voiceKey: "marathi-male", text: chunks[i] });
      h.audios[i].onended?.(new Event("ended"));
      await new Promise(r => setTimeout(r, 0));
    }
    expect(h.deps.fetch).toHaveBeenCalledTimes(chunks.length);
    expect(h.states.at(-1)?.isSpeaking).toBe(false);
    await h.player.speak(text, "marathi-male");
    const oldEnded = h.audios.at(-1)!.onended;
    const count = h.deps.fetch.mock.calls.length;
    h.player.stop();
    oldEnded?.call(h.audios.at(-1)!, new Event("ended"));
    expect(h.deps.fetch).toHaveBeenCalledTimes(count);
  });
  it("discards a late reply audio request when stopped", async () => {
    const h = harness(); const pending = deferred<Response>();
    h.deps.fetch.mockReturnValueOnce(pending.promise);
    const speaking = h.player.speak("Reply text. ".repeat(100), "guide");
    h.player.stop();
    pending.resolve(audioResponse());
    await speaking;
    expect(h.deps.createAudio).not.toHaveBeenCalled();
  });
  it("removes presentation markup and never splits Unicode surrogate pairs", () => {
    expect(narrationText("**Read** {{course|demo|Demo course}} and [the lesson](https://example.test)."))
      .toBe("Read Demo course and the lesson.");
    const text = "x".repeat(499) + "😀" + "y".repeat(20);
    const chunks = speechChunks(text);
    expect(chunks.join("")).toBe(text);
    expect(chunks[0]).toHaveLength(499);
  });
  it("reports overlong replies instead of silently truncating them", async () => {
    const h = harness();
    await h.player.speak("x".repeat(50001), "guide");
    expect(h.deps.fetch).not.toHaveBeenCalled();
    expect(h.states.at(-1)?.error).toContain("too long");
  });
  it.each(["stop", "mute", "switch voice", "close chat", "navigate", "account change", "unmount"])("never starts stale audio after %s cancellation", async () => {
    const h = harness(); const pending = deferred<Response>();
    h.deps.fetch.mockReturnValueOnce(pending.promise);
    const playing = h.player.play("preview", "guide");
    const signal = h.deps.fetch.mock.calls[0][1].signal;
    h.player.stop(); // These UI transitions all call the same cancellation method.
    expect(signal.aborted).toBe(true);
    pending.resolve(audioResponse()); await playing;
    expect(h.deps.createAudio).not.toHaveBeenCalled();
    expect(h.states.at(-1)).toEqual({ loading: false, isSpeaking: false, error: null });
  });
  it("prevents overlapping previews and phrase playback", async () => {
    const h = harness();
    await h.player.play("preview", "first");
    const oldPlaying = h.audios[0].onplaying;
    await h.player.play("platform_help", "second");
    expect(h.audios[0].pause).toHaveBeenCalled();
    expect(h.audios[0].onplaying).toBeNull();
    oldPlaying?.call(h.audios[0], new Event("playing"));
    expect(h.states.at(-1)?.isSpeaking).toBe(false);
    h.audios[1].onplaying?.(new Event("playing"));
    expect(h.states.at(-1)?.isSpeaking).toBe(true);
  });
  it("discards a slow first preview when the next starts", async () => {
    const h = harness(); const pending = deferred<Response>();
    h.deps.fetch.mockReturnValueOnce(pending.promise);
    const first = h.player.play("preview", "first");
    await h.player.play("preview", "second");
    pending.resolve(audioResponse()); await first;
    expect(h.deps.createAudio).toHaveBeenCalledTimes(1);
  });
  it("does not resurrect speaking when a stale play promise resolves", async () => {
    const h = harness(); const pending = deferred<void>();
    h.deps.createAudio.mockImplementationOnce(() => {
      const a = { play: jest.fn(() => pending.promise), pause: jest.fn(), load: jest.fn(), removeAttribute: jest.fn() } as unknown as HTMLAudioElement;
      h.audios.push(a); return a;
    });
    const first = h.player.play("preview", "first");
    await new Promise(r => setTimeout(r, 0));
    h.player.stop(); pending.resolve(); await first;
    expect(h.states.at(-1)?.isSpeaking).toBe(false);
  });
  it("shows safe errors without creating audio after provider failure", async () => {
    const h = harness();
    h.deps.fetch.mockResolvedValueOnce(new Response("private detail", { status: 503 }));
    await h.player.play("preview", "guide");
    expect(h.deps.createAudio).not.toHaveBeenCalled();
    expect(h.states.at(-1)?.error).toContain("unavailable");
    expect(h.states.at(-1)?.error).not.toContain("private");
  });
  it("handles autoplay failure and media errors with cleanup", async () => {
    const h = harness();
    h.deps.createAudio.mockImplementationOnce(() => {
      const a = { play: jest.fn(async () => { throw new Error("blocked"); }), pause: jest.fn(), load: jest.fn(), removeAttribute: jest.fn() } as unknown as HTMLAudioElement;
      h.audios.push(a); return a;
    });
    await h.player.play("preview", "guide");
    expect(h.states.at(-1)?.error).toContain("blocked");
    expect(h.deps.revokeUrl).toHaveBeenCalled();
    await h.player.play("preview", "guide");
    h.audios[1].onerror?.(new Event("error"));
    expect(h.states.at(-1)?.error).toContain("could not be played");
  });
  it("cancels a stalled client request and ignores its late result", async () => {
    jest.useFakeTimers();
    try {
      const h = harness(); const pending = deferred<Response>();
      h.deps.fetch.mockReturnValueOnce(pending.promise);
      const play = h.player.play("preview", "guide");
      await jest.advanceTimersByTimeAsync(65_001);
      expect(h.states.at(-1)?.error).toContain("too long");
      pending.resolve(audioResponse()); await play;
      expect(h.deps.createAudio).not.toHaveBeenCalled();
    } finally { jest.useRealTimers(); }
  });
});
describe("incremental narration passages", () => {
  it("uses a short first sentence and normal-sized remaining passages without dropping text", () => {
    const buffer = new SpeechReplyBuffer(500);
    const first = "This is the first complete sentence.";
    const rest = " More useful explanation follows.".repeat(40);
    expect(buffer.take("This is the first")).toEqual([]);
    const chunks = [...buffer.take(`${first} `), ...buffer.take(first + rest, true)];
    expect(chunks[0]).toBe(first);
    expect(chunks.slice(1).some(chunk => chunk.length > 180)).toBe(true);
    expect(chunks.every(chunk => chunk.length <= 500)).toBe(true);
    expect(chunks.join("")).toBe(first + rest);
    expect(buffer.take(first + rest, true)).toEqual([]);
  });
  it("holds unfinished links, course tags and fenced code instead of speaking raw markup", () => {
    const buffer = new SpeechReplyBuffer();
    const first = "This introduction can be spoken.";
    expect(buffer.take(`${first} [Private label](https://example.test`)).toEqual([first]);
    const full = `${first} [The lesson](https://example.test). {{course|demo|Demo course}} \`\`\`js\nsecretExample();\n\`\`\``;
    const chunks = buffer.take(full, true);
    expect(first + chunks.join("")).toBe(narrationText(full));
    expect(chunks.join("")).not.toContain("secretExample");
    const code = new SpeechReplyBuffer();
    expect(code.take("```js\nsecretExample();")).toEqual([]);
    const tag = new SpeechReplyBuffer();
    expect(tag.take("{{course|private")).toEqual([]);
  });
  it("does not split the decimal in a first sentence before the following token arrives", () => {
    const buffer = new SpeechReplyBuffer();
    expect(buffer.take("The correct measurement is 3.")).toEqual([]);
    expect(buffer.take("The correct measurement is 3.14 metres. ")).toEqual(["The correct measurement is 3.14 metres."]);
  });
});
describe("local speech preferences", () => {
  it("isolates accounts and does not migrate shared legacy settings", () => {
    const data = new Map<string, string>([["requisor-tts-voice", "legacy"]]);
    const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); } };
    expect(readSpeechPreferences(storage, "first")).toBeNull();
    writeSpeechPreferences(storage, "first", { voiceKey: "female", muted: true });
    writeSpeechPreferences(storage, "second", { voiceKey: "male", muted: false });
    expect(readSpeechPreferences(storage, "first")).toEqual({ voiceKey: "female", muted: true });
    expect(readSpeechPreferences(storage, "second")).toEqual({ voiceKey: "male", muted: false });
    expect(speechPreferenceKey("first")).not.toBe(speechPreferenceKey("second"));
  });
  it("survives blocked or corrupt storage without inheriting another account", () => {
    expect(readSpeechPreferences({ getItem: () => { throw new Error(); } }, "first")).toBeNull();
    expect(readSpeechPreferences({ getItem: () => "broken" }, "first")).toBeNull();
    expect(() => writeSpeechPreferences({ setItem: () => { throw new Error(); } }, "first", { voiceKey: "a", muted: false })).not.toThrow();
  });
});
