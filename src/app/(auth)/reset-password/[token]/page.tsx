import Link from "next/link";
import { getI18n } from "@/i18n/server";
import { ResetPasswordForm } from "@/features/auth/components/reset-password-form";
import { isPasswordResetTokenUsable } from "@/features/auth/queries";

export default async function ResetPasswordPage({ params }: PageProps<"/reset-password/[token]">) {
  const { t } = await getI18n();
  const { token } = await params;

  if (!(await isPasswordResetTokenUsable(token))) {
    return (
      <>
        <h1 className="text-2xl font-semibold">{t.auth.linkExpired}</h1>
        <p className="text-sm text-neutral-500">{t.auth.linkExpiredText}</p>
        <Link href="/forgot-password" className="text-sm underline">
          {t.auth.requestNewLink}
        </Link>
      </>
    );
  }

  return (
    <>
      <h1 className="text-2xl font-semibold">{t.auth.chooseNewPassword}</h1>
      <ResetPasswordForm token={token} />
    </>
  );
}
