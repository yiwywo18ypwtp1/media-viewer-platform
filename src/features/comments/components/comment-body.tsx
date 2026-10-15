import { parseMarkup } from "../markup";
import type { Member } from "../schema";

// Renders tokens as React elements: user text is always escaped by React,
// never parsed as HTML. Only http(s) links are produced (see markup.ts).
export function CommentBody({ body, mentions, members }: { body: string; mentions: string[]; members: Member[] }) {
  const mentioned = members.filter((member) => mentions.includes(member.id));
  return (
    <p className="text-sm break-words whitespace-pre-wrap">
      {parseMarkup(body, mentioned).map((token, index) => {
        switch (token.type) {
          case "text":
            return token.text;
          case "bold":
            return <strong key={index}>{token.text}</strong>;
          case "italic":
            return <em key={index}>{token.text}</em>;
          case "code":
            return (
              <code key={index} className="rounded bg-neutral-100 px-1 font-mono text-xs dark:bg-neutral-800">
                {token.text}
              </code>
            );
          case "link":
            return (
              <a key={index} href={token.href} target="_blank" rel="noopener noreferrer nofollow" className="underline">
                {token.href}
              </a>
            );
          case "mention":
            return (
              <span key={index} className="font-medium text-blue-700 dark:text-blue-400">
                @{token.name}
              </span>
            );
        }
      })}
    </p>
  );
}
