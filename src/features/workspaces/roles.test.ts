import { describe, expect, it } from "vitest";
import { can } from "./roles";

describe("can", () => {
  it("lets every role view", () => {
    expect(can("viewer", "viewProject")).toBe(true);
    expect(can("owner", "viewProject")).toBe(true);
  });

  it("keeps viewers read-only", () => {
    expect(can("viewer", "comment")).toBe(false);
    expect(can("viewer", "upload")).toBe(false);
  });

  it("lets reviewers comment and decide but not upload", () => {
    expect(can("reviewer", "comment")).toBe(true);
    expect(can("reviewer", "decideReview")).toBe(true);
    expect(can("reviewer", "upload")).toBe(false);
  });

  it("lets editors upload but not manage members", () => {
    expect(can("editor", "upload")).toBe(true);
    expect(can("editor", "manageMembers")).toBe(false);
  });

  it("lets owners do everything", () => {
    expect(can("owner", "manageMembers")).toBe(true);
  });
});
