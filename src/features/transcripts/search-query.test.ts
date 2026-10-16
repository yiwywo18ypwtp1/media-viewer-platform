import { describe, expect, it } from "vitest";
import { prefixQuery } from "./search-query";

describe("prefixQuery", () => {
  it("matches every word by its beginning", () => {
    expect(prefixQuery("Лого over")).toBe("лого:* & over:*");
  });

  it("drops anything that isn't a letter or digit", () => {
    expect(prefixQuery("logo') | !x & y:*")).toBe("logo:* & x:* & y:*");
    expect(prefixQuery("  !!  ")).toBeNull();
  });

  it("caps the number of words", () => {
    expect(prefixQuery("a b c d e f g h i j")?.split(" & ")).toHaveLength(8);
  });
});
