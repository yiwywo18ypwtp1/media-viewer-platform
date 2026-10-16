"use server";

import { cookies } from "next/headers";
import { LOCALE_COOKIE, LOCALES, type Locale } from "./locales";

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

// The language switcher. Remembered for a year in this browser.
export async function setLocale(locale: unknown) {
  if (!LOCALES.includes(locale as Locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale as Locale, { path: "/", maxAge: ONE_YEAR_SECONDS, sameSite: "lax" });
}
