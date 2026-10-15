import { describe, expect, it } from "vitest";
import { applyCommentChange, applyMarkerChange, type ClientComment } from "./comment-changes";

function comment(id: string, overrides: Partial<ClientComment> = {}): ClientComment {
  return {
    id,
    versionId: "v",
    parentId: null,
    author: { id: "u", name: "U" },
    body: id,
    timecodeMs: null,
    annotation: null,
    mentions: [],
    resolvedAt: null,
    createdAt: "2026-10-15T10:00:00.000Z",
    editedAt: null,
    revision: 1,
    replies: [],
    ...overrides,
  };
}

describe("applyCommentChange", () => {
  it("appends a new thread", () => {
    expect(applyCommentChange([comment("a")], { type: "upsert", comment: comment("b") }).map((c) => c.id)).toEqual([
      "a",
      "b",
    ]);
  });

  it("is idempotent: the API response and the SSE echo yield one comment", () => {
    const optimistic = comment("a", { pending: true });
    let threads = applyCommentChange([], { type: "upsert", comment: optimistic });
    threads = applyCommentChange(threads, { type: "upsert", comment: comment("a") }); // API response
    threads = applyCommentChange(threads, { type: "upsert", comment: comment("a") }); // SSE echo
    expect(threads).toHaveLength(1);
    expect(threads[0].pending).toBeUndefined();
  });

  it("ignores an older revision arriving after a newer one", () => {
    const threads = [comment("a", { revision: 3, body: "new" })];
    const next = applyCommentChange(threads, { type: "upsert", comment: comment("a", { revision: 2, body: "old" }) });
    expect(next[0].body).toBe("new");
  });

  it("keeps existing replies when an update carries none", () => {
    const threads = [comment("a", { replies: [comment("r", { parentId: "a" })] })];
    const next = applyCommentChange(threads, { type: "upsert", comment: comment("a", { revision: 2, body: "edited" }) });
    expect(next[0].replies.map((r) => r.id)).toEqual(["r"]);
  });

  it("adds and deletes replies inside their thread", () => {
    let threads = [comment("a"), comment("b")];
    threads = applyCommentChange(threads, { type: "upsert", comment: comment("r", { parentId: "b" }) });
    expect(threads[1].replies.map((r) => r.id)).toEqual(["r"]);
    threads = applyCommentChange(threads, { type: "delete", id: "r", parentId: "b" });
    expect(threads[1].replies).toEqual([]);
  });

  it("skips replies to threads that aren't loaded", () => {
    const threads = [comment("a")];
    expect(applyCommentChange(threads, { type: "upsert", comment: comment("r", { parentId: "zzz" }) })).toEqual(threads);
  });

  it("deletes a thread", () => {
    expect(applyCommentChange([comment("a"), comment("b")], { type: "delete", id: "a", parentId: null }).map((c) => c.id)).toEqual(["b"]);
  });

  it("appends a page without duplicating threads already received live", () => {
    const threads = [comment("a"), comment("c")]; // "c" arrived over SSE
    const next = applyCommentChange(threads, { type: "append-page", comments: [comment("b"), comment("c")] });
    expect(next.map((c) => c.id)).toEqual(["a", "c", "b"]);
  });
});

describe("applyMarkerChange", () => {
  it("adds timecoded threads, updates resolve state, removes on delete", () => {
    let markers = applyMarkerChange([], { type: "upsert", comment: comment("a", { timecodeMs: 1500 }) });
    expect(markers).toMatchObject([{ id: "a", timeMs: 1500, resolved: false }]);
    markers = applyMarkerChange(markers, {
      type: "upsert",
      comment: comment("a", { timecodeMs: 1500, resolvedAt: "2026-10-15T11:00:00.000Z", revision: 2 }),
    });
    expect(markers).toMatchObject([{ id: "a", resolved: true }]);
    markers = applyMarkerChange(markers, { type: "delete", id: "a", parentId: null });
    expect(markers).toEqual([]);
  });

  it("ignores replies and comments without a timecode", () => {
    expect(applyMarkerChange([], { type: "upsert", comment: comment("a") })).toEqual([]);
    expect(applyMarkerChange([], { type: "upsert", comment: comment("r", { parentId: "a", timecodeMs: 10 }) })).toEqual([]);
  });
});
