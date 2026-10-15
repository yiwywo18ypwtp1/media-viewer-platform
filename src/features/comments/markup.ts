// "Markdown-lite" for comment bodies: **bold**, _italic_, `code`, http(s)
// links and @mentions. Parsed into tokens that React renders as elements, so
// user text is never injected as HTML. No nesting: one style per span.

export type Token =
  | { type: "text"; text: string }
  | { type: "bold" | "italic" | "code"; text: string }
  | { type: "link"; href: string }
  | { type: "mention"; userId: string; name: string };

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function parseMarkup(body: string, mentions: { id: string; name: string }[] = []): Token[] {
  // Longest names first so "@Ann Lee" wins over "@Ann".
  const names = [...mentions].sort((a, b) => b.name.length - a.name.length);
  const mentionPattern = names.length > 0 ? `|@(${names.map((m) => escapeRegex(m.name)).join("|")})` : "";
  const pattern = new RegExp(
    [
      String.raw`\*\*(.+?)\*\*`, // 1 bold
      // 2 italic: underscores at word boundaries, so snake_case stays text
      String.raw`(?<![\w])_(?!\s)(.+?)(?<!\s)_(?![\w])`,
      "`([^`]+)`", // 3 code
      String.raw`(https?:\/\/[^\s<>"]+[^\s<>".,;:!?)\]])`, // 4 link, trailing punctuation excluded
    ].join("|") + mentionPattern, // 5 mention
    "g",
  );

  const tokens: Token[] = [];
  let last = 0;
  for (const match of body.matchAll(pattern)) {
    if (match.index > last) tokens.push({ type: "text", text: body.slice(last, match.index) });
    const [, bold, italic, code, link, mention] = match;
    if (bold !== undefined) tokens.push({ type: "bold", text: bold });
    else if (italic !== undefined) tokens.push({ type: "italic", text: italic });
    else if (code !== undefined) tokens.push({ type: "code", text: code });
    else if (link !== undefined) tokens.push({ type: "link", href: link });
    else if (mention !== undefined) {
      const member = names.find((m) => m.name === mention)!;
      tokens.push({ type: "mention", userId: member.id, name: member.name });
    }
    last = match.index + match[0].length;
  }
  if (last < body.length) tokens.push({ type: "text", text: body.slice(last) });
  return tokens;
}
