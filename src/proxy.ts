import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/features/auth/cookie";

// Optimistic gate only: checks that a session cookie exists, without touching
// the database. The real check (valid, unexpired session) is requireUser()
// in the data layer, which every protected page and action goes through.

const PUBLIC_PATHS = ["/login", "/register", "/forgot-password", "/reset-password", "/invite"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // CSRF protection for Route Handlers authenticated by cookie. Browsers always
  // send Origin on these methods; another site's page can't fake ours.
  // (Server Actions get the same check from Next itself.) SameSite=Lax already
  // blocks most cross-site requests; this also covers same-site subdomains.
  // Compared with APP_URL, not request.nextUrl: inside Docker the server sees
  // its bind address (0.0.0.0:3000), not the address the browser used.
  if (
    pathname.startsWith("/api/") &&
    UNSAFE_METHODS.has(request.method) &&
    request.headers.get("origin") !== new URL(process.env.APP_URL!).origin
  ) {
    return Response.json(
      { error: { code: "bad_origin", message: "Cross-origin request rejected." } },
      { status: 403 },
    );
  }

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
