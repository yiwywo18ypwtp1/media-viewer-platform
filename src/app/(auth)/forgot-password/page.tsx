import Link from "next/link";
import { getI18n } from "@/i18n/server";
import { ForgotPasswordForm } from "@/features/auth/components/forgot-password-form";

export default async function ForgotPasswordPage() {
  const { t } = await getI18n();
  return (
    <>
      <h1 className="text-2xl font-semibold">{t.auth.resetTitle}</h1>
      <p className="text-sm text-neutral-500">{t.auth.resetIntro}</p>
      <ForgotPasswordForm />
      <Link href="/login" className="text-sm underline">
        {t.auth.backToSignIn}
      </Link>
    </>
  );
}
