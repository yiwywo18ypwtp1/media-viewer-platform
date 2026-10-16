// Languages and the rules that don't depend on a dictionary (tested in
// locales.test.ts). Shared by server and client.

export const LOCALES = ["en", "ru"] as const;
export type Locale = (typeof LOCALES)[number];
export const LOCALE_COOKIE = "locale";

const isLocale = (value: string | undefined): value is Locale => LOCALES.includes(value as Locale);

// The user's choice (cookie) wins; otherwise the browser's preferred language
// if we have it; otherwise English.
export function pickLocale(cookie: string | undefined, acceptLanguage: string | null): Locale {
  if (isLocale(cookie)) return cookie;
  for (const part of (acceptLanguage ?? "").split(",")) {
    const language = part.split(";")[0].trim().slice(0, 2).toLowerCase();
    if (isLocale(language)) return language;
  }
  return "en";
}

// Russian has three plural forms: 1 файл, 2 файла, 5 файлов (and 11 файлов, 21 файл).
export function pluralRu(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
