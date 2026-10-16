import { describe, expect, it } from "vitest";
import { listHref, parseListParams, sortHref, type ListParams } from "./list-params";

const DEFAULTS: ListParams = { view: "grid", sort: "updated", dir: "desc", status: "all", folder: null };

describe("parseListParams", () => {
  it("defaults an empty URL", () => {
    expect(parseListParams({})).toEqual(DEFAULTS);
  });

  it("reads valid params", () => {
    expect(parseListParams({ view: "table", sort: "name", dir: "desc", status: "approved" })).toEqual({
      view: "table",
      sort: "name",
      dir: "desc",
      status: "approved",
      folder: null,
    });
  });

  it("falls back per param on garbage, keeping the valid ones", () => {
    expect(parseListParams({ view: "kanban", sort: "name", status: "nope", dir: "sideways" })).toEqual({
      view: "grid",
      sort: "name",
      dir: "asc",
      status: "all",
      folder: null,
    });
  });

  it("keeps a folder id and drops anything else", () => {
    const folder = "00000000-0000-4000-8000-000000000001";
    expect(parseListParams({ folder }).folder).toBe(folder);
    expect(parseListParams({ folder: "../etc" }).folder).toBeNull();
  });

  it("uses the first value of repeated params", () => {
    expect(parseListParams({ view: ["table", "grid"] }).view).toBe("table");
  });
});

describe("listHref", () => {
  it("omits defaults", () => {
    expect(listHref("p1", DEFAULTS, {})).toBe("/p/p1");
  });

  it("keeps other params when changing one", () => {
    const current = { ...DEFAULTS, view: "table" as const };
    expect(listHref("p1", current, { status: "approved" })).toBe("/p/p1?view=table&status=approved");
  });

  it("keeps the open folder", () => {
    expect(listHref("p1", { ...DEFAULTS, folder: "f1" }, { view: "table" })).toBe("/p/p1?view=table&folder=f1");
  });

  it("resets direction when the sort column changes", () => {
    expect(listHref("p1", { ...DEFAULTS, dir: "asc" }, { sort: "name" })).toBe("/p/p1?sort=name");
  });
});

describe("sortHref", () => {
  it("toggles direction on the active column", () => {
    expect(sortHref("p1", { ...DEFAULTS, sort: "name", dir: "asc" }, "name")).toBe("/p/p1?sort=name&dir=desc");
  });

  it("starts another column at its default direction", () => {
    expect(sortHref("p1", DEFAULTS, "created")).toBe("/p/p1?sort=created");
  });
});
