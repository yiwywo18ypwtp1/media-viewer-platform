import "server-only";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { LOCALE_COOKIE, pickLocale, type Locale } from "./locales";
import { dictionaries, translateMessage } from "./translate";

// The request's language: the saved choice, else the browser's.
export const getLocale = cache(async (): Promise<Locale> => {
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()]);
  return pickLocale(cookieStore.get(LOCALE_COOKIE)?.value, headerList.get("accept-language"));
});

// For Server Components: `const { t } = await getI18n()`, then t.nav.inbox.
// tm() translates a message from shared code (see translate.ts).
export async function getI18n() {
  const locale = await getLocale();
  return { locale, t: dictionaries[locale], tm: (message: string) => translateMessage(locale, message) };
}
