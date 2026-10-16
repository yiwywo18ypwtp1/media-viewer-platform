"use client";

import { createContext, use, type ReactNode } from "react";
import type { Locale } from "./locales";
import { dictionaries, translateMessage } from "./translate";

// The root layout puts the request's locale here; client components read the
// dictionary with useI18n(). Only the code is passed down: the dictionaries
// are imported on the client too.
const LocaleContext = createContext<Locale>("en");

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext value={locale}>{children}</LocaleContext>;
}

export function useI18n() {
  const locale = use(LocaleContext);
  return { locale, t: dictionaries[locale], tm: (message: string) => translateMessage(locale, message) };
}
