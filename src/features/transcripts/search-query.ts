// The text a user types -> a Postgres tsquery that matches word beginnings:
// "лого ove" -> "лого:* & ove:*". Only letters and digits survive, so nothing
// typed can break the query syntax. The "simple" config doesn't stem words,
// which is why prefixes matter ("логотип" should find "логотипа").
export function prefixQuery(input: string): string | null {
  const words = input.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  if (words.length === 0) return null;
  return words.slice(0, 8).map((word) => `${word}:*`).join(" & ");
}
