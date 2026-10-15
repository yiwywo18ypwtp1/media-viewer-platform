import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor } from "./cursor";
import { parseMarkup } from "./markup";
import { keepMentionsInBody } from "./schema";

const rita = { id: "11111111-1111-4111-8111-111111111111", name: "Rita Reviewer" };
const ann = { id: "22222222-2222-4222-8222-222222222222", name: "Ann" };
const annLee = { id: "33333333-3333-4333-8333-333333333333", name: "Ann Lee" };

describe("parseMarkup", () => {
  it("returns plain text untouched", () => {
    expect(parseMarkup("just text")).toEqual([{ type: "text", text: "just text" }]);
  });

  it("parses bold, italic, code and links", () => {
    expect(parseMarkup("**loud** and _soft_ with `x = 1` see https://example.com/a?b=1.")).toEqual([
      { type: "bold", text: "loud" },
      { type: "text", text: " and " },
      { type: "italic", text: "soft" },
      { type: "text", text: " with " },
      { type: "code", text: "x = 1" },
      { type: "text", text: " see " },
      { type: "link", href: "https://example.com/a?b=1" },
      { type: "text", text: "." },
    ]);
  });

  it("leaves snake_case and lone markers alone", () => {
    expect(parseMarkup("file_name_v2 costs 5 * 3")).toEqual([{ type: "text", text: "file_name_v2 costs 5 * 3" }]);
  });

  it("only links http(s): no javascript: URLs", () => {
    expect(parseMarkup("javascript:alert(1)")).toEqual([{ type: "text", text: "javascript:alert(1)" }]);
  });

  it("keeps HTML as text (rendered escaped by React)", () => {
    expect(parseMarkup("<img src=x onerror=alert(1)>")).toEqual([
      { type: "text", text: "<img src=x onerror=alert(1)>" },
    ]);
  });

  it("finds mentions of known members, longest name first", () => {
    expect(parseMarkup("@Ann Lee and @Ann, ping @Rita Reviewer", [ann, annLee, rita])).toEqual([
      { type: "mention", userId: annLee.id, name: "Ann Lee" },
      { type: "text", text: " and " },
      { type: "mention", userId: ann.id, name: "Ann" },
      { type: "text", text: ", ping " },
      { type: "mention", userId: rita.id, name: "Rita Reviewer" },
    ]);
  });

  it("doesn't treat unknown @names as mentions", () => {
    expect(parseMarkup("@Nobody here", [rita])).toEqual([{ type: "text", text: "@Nobody here" }]);
  });
});

describe("keepMentionsInBody", () => {
  it("drops mentions whose @Name was deleted from the text, and duplicates", () => {
    expect(keepMentionsInBody("thanks @Rita Reviewer", [rita.id, ann.id, rita.id], [rita, ann])).toEqual([rita.id]);
  });

  it("drops ids that aren't members", () => {
    expect(keepMentionsInBody("@Rita Reviewer", ["44444444-4444-4444-8444-444444444444"], [rita])).toEqual([]);
  });
});

describe("cursor", () => {
  it("round-trips", () => {
    const cursor = { createdAt: new Date("2026-10-15T12:34:56.789Z"), id: rita.id };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it("rejects garbage", () => {
    expect(decodeCursor("not-a-cursor")).toBeNull();
  });
});
