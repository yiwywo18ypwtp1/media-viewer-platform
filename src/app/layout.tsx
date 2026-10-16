import type { Metadata } from "next";
import { connection } from "next/server";
import { I18nProvider } from "@/i18n/client";
import { getLocale } from "@/i18n/server";
import "./globals.css";

export const metadata: Metadata = {
  title: "Media Review Hub",
  description: "Video and image review for creative teams",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Every page renders per request, so each gets the nonce from its CSP header
  // (see proxy.ts). A prerendered page would carry no nonce and its scripts
  // would be blocked. All pages but two were per-request anyway.
  await connection();
  const locale = await getLocale();
  return (
    <html lang={locale} className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <I18nProvider locale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
