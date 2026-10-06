import { editTimeOf, findPauses, keptSegments, totalSeconds } from "@/lib/video-editing";

/** A loudness envelope in 50 ms steps: [seconds, level] runs. */
const envelope = (...runs: Array<[number, number]>) => runs.flatMap(([seconds, level]) => Array(Math.round(seconds / 0.05)).fill(level));

describe("finding pauses", () => {
  const take = envelope([2, 0.2], [2, 0.002], [3, 0.2], [0.6, 0.002], [2, 0.2]);

  it("finds a long silence and leaves a little breathing room at each end", () => {
    const pauses = findPauses(take, 0.05, 0.2);
    expect(pauses).toHaveLength(1);
    expect(pauses[0].start).toBeCloseTo(2.18, 2);
    expect(pauses[0].end).toBeCloseTo(3.82, 2);
  });

  it("cuts shorter pauses too when sensitivity is turned up", () => {
    expect(findPauses(take, 0.05, 1)).toHaveLength(2);
  });

  it("judges quiet against the speaker's own level, and finds nothing in silence or steady speech", () => {
    const softVoice = envelope([2, 0.02], [2, 0.0002], [2, 0.02]);
    expect(findPauses(softVoice, 0.05, 0.2)).toHaveLength(1);
    expect(findPauses(envelope([5, 0.2]), 0.05, 1)).toEqual([]);
    expect(findPauses(envelope([5, 0]), 0.05, 1)).toEqual([]);
    expect(findPauses([], 0.05, 0.5)).toEqual([]);
  });
});

describe("what is kept", () => {
  it("is the trimmed range with the cuts taken out", () => {
    const kept = keptSegments(1, 10, [{ start: 3, end: 4 }, { start: 6, end: 7.5 }]);
    expect(kept).toEqual([{ start: 1, end: 3 }, { start: 4, end: 6 }, { start: 7.5, end: 10 }]);
    expect(totalSeconds(kept)).toBeCloseTo(6.5);
  });

  it("handles cuts that overlap the trim points or each other, and drops slivers", () => {
    expect(keptSegments(2, 8, [{ start: 0, end: 3 }, { start: 7, end: 12 }])).toEqual([{ start: 3, end: 7 }]);
    expect(keptSegments(0, 10, [{ start: 2, end: 5 }, { start: 4, end: 6 }])).toEqual([{ start: 0, end: 2 }, { start: 6, end: 10 }]);
    expect(keptSegments(0, 10, [{ start: 0.1, end: 9.95 }])).toEqual([]);
    expect(keptSegments(0, 10, [])).toEqual([{ start: 0, end: 10 }]);
  });

  it("maps a moment in the source to its place in the edit", () => {
    const kept = [{ start: 1, end: 3 }, { start: 4, end: 6 }];
    expect(editTimeOf(kept, 2)).toBe(1);
    expect(editTimeOf(kept, 5)).toBe(3);
    expect(editTimeOf(kept, 3.5)).toBeNull(); // inside a cut
    expect(editTimeOf(kept, 0.5)).toBeNull(); // before the trim
  });
});
