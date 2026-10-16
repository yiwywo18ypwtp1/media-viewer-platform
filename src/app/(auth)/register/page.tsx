import Link from "next/link";
import { getI18n } from "@/i18n/server";
import { redirect } from "next/navigation";
import { RegisterForm } from "@/features/auth/components/register-form";
import { safeNextPath } from "@/features/auth/next-path";
import { getCurrentUser } from "@/features/auth/session";

export default async function RegisterPage({ searchParams }: PageProps<"/register">) {
  const { t } = await getI18n();
  const next = safeNextPath((await searchParams).next);
  if (await getCurrentUser()) redirect(next);

  const loginHref = next === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`;

  return (
    <>
      <h1 className="text-2xl font-semibold">{t.auth.createAccount}</h1>
      <RegisterForm next={next} />
      <p className="text-sm">
        {t.auth.haveAccount}{" "}
        <Link href={loginHref} className="underline">
          {t.auth.signIn}
        </Link>
      </p>
    </>
  );
}
