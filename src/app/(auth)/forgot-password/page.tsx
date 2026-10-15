import Link from "next/link";
import { ForgotPasswordForm } from "@/features/auth/components/forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Reset your password</h1>
      <p className="text-sm text-neutral-500">We&apos;ll email you a link to choose a new password.</p>
      <ForgotPasswordForm />
      <Link href="/login" className="text-sm underline">
        Back to sign in
      </Link>
    </>
  );
}
