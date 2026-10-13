import { NextResponse, type NextRequest } from "next/server";
import { isValidSessionToken, SESSION_COOKIE } from "@/lib/auth";

/** Everything except the login page and the EA's ingest endpoint needs a valid session. */
export function proxy(request: NextRequest): NextResponse {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (isValidSessionToken(token, Math.floor(Date.now() / 1000))) return NextResponse.next();
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  // The (?:/|$) boundary keeps look-alike paths such as /login-help behind the session check.
  matcher: ["/((?!(?:login|api/ingest)(?:/|$)|_next/static|_next/image|favicon\\.ico$).*)"],
};
