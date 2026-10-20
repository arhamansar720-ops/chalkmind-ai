import { NextResponse, type NextRequest } from "next/server";

// Optimistic gate for the app pages: without a session cookie, go sign in.
// The real check (is the session valid?) happens in every API route, so a
// stale cookie just gets a 401 there and the app sends the user here.
export function proxy(request: NextRequest) {
  if (process.env.REQUIRE_AUTH !== "true" || !process.env.DATABASE_URL) return NextResponse.next();
  if (request.cookies.get("cm_session")?.value) return NextResponse.next();
  const url = new URL("/signin", request.url);
  url.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/app/:path*"],
};
