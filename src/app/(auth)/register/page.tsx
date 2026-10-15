import Link from "next/link";
import { redirect } from "next/navigation";
import { RegisterForm } from "@/features/auth/components/register-form";
import { safeNextPath } from "@/features/auth/next-path";
import { getCurrentUser } from "@/features/auth/session";

export default async function RegisterPage({ searchParams }: PageProps<"/register">) {
  const next = safeNextPath((await searchParams).next);
  if (await getCurrentUser()) redirect(next);

  const loginHref = next === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`;

  return (
    <>
      <h1 className="text-2xl font-semibold">Create an account</h1>
      <RegisterForm next={next} />
      <p className="text-sm">
        Already have an account?{" "}
        <Link href={loginHref} className="underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
