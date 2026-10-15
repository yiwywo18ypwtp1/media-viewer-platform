import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/features/auth/components/login-form";
import { safeNextPath } from "@/features/auth/next-path";
import { getCurrentUser } from "@/features/auth/session";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const next = safeNextPath((await searchParams).next);
  if (await getCurrentUser()) redirect(next);

  const registerHref = next === "/" ? "/register" : `/register?next=${encodeURIComponent(next)}`;

  return (
    <>
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <LoginForm next={next} />
      <div className="flex justify-between text-sm">
        <Link href={registerHref} className="underline">
          Create an account
        </Link>
        <Link href="/forgot-password" className="underline">
          Forgot password?
        </Link>
      </div>
    </>
  );
}
