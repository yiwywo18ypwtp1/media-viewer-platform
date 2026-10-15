import Link from "next/link";
import { ResetPasswordForm } from "@/features/auth/components/reset-password-form";
import { isPasswordResetTokenUsable } from "@/features/auth/queries";

export default async function ResetPasswordPage({ params }: PageProps<"/reset-password/[token]">) {
  const { token } = await params;

  if (!(await isPasswordResetTokenUsable(token))) {
    return (
      <>
        <h1 className="text-2xl font-semibold">Link expired</h1>
        <p className="text-sm text-neutral-500">
          This reset link was already used or is older than 30 minutes.
        </p>
        <Link href="/forgot-password" className="text-sm underline">
          Request a new link
        </Link>
      </>
    );
  }

  return (
    <>
      <h1 className="text-2xl font-semibold">Choose a new password</h1>
      <ResetPasswordForm token={token} />
    </>
  );
}
