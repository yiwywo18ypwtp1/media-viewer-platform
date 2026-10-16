import { en, type Dictionary } from "./dictionaries/en";
import { ru } from "./dictionaries/ru";
import type { Locale } from "./locales";
import { ruMessages } from "./messages-ru";

// Both dictionaries are plain modules: the server and client components
// import them directly. Only the locale code crosses from server to client
// (functions in a dictionary couldn't be passed as props).
export const dictionaries: Record<Locale, Dictionary> = { en, ru };

// Messages that come from shared code rather than from a component: zod
// schemas, API and Server Action errors, the worker's processing errors.
// They're written in English and the English text is the key (like gettext's
// msgid), translated where they're shown. Unknown text shows as it is.
export function translateMessage(locale: Locale, message: string): string {
  if (locale === "en") return message;
  return ruMessages[message] ?? message;
}
