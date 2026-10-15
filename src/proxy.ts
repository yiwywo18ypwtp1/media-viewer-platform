import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/features/auth/cookie";

// Optimistic gate only: checks that a session cookie exists, without touching
// the database. The real check (valid, unexpired session) is requireUser()
// in the data layer, which every protected page and action goes through.

const PUBLIC_PATHS = ["/login", "/register", "/forgot-password", "/reset-password", "/invite"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (isPublic(pathname) || request.cookies.has(SESSION_COOKIE)) {
    return NextResponse.next();
  }

  // API clients get a status code, not an HTML redirect.
  if (pathname.startsWith("/api/")) {
    return Response.json(
      { error: { code: "unauthorized", message: "Sign in required." } },
      { status: 401 },
    );
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", pathname + search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Everything except static assets and the public health endpoint.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/health).*)"],
};
