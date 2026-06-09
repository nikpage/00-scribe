import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const securityHeaders: Record<string, string> = {
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "same-origin",
  "Permissions-Policy": "camera=(), geolocation=(), microphone=(self)",
};

export async function middleware(request: NextRequest) {
  // Skip Supabase session refresh for requests that have no session to refresh:
  // the transcription webhook (reachable by the third-party provider) and the
  // auth endpoints themselves (the user is mid-login). Calling getUser() here
  // just adds a wasted Supabase round-trip to the two hottest login requests.
  if (
    request.nextUrl.pathname.startsWith("/api/webhook") ||
    request.nextUrl.pathname.startsWith("/api/eway/selftest") ||
    request.nextUrl.pathname.startsWith("/api/auth")
  ) {
    const passthrough = NextResponse.next();
    for (const [k, v] of Object.entries(securityHeaders)) passthrough.headers.set(k, v);
    return passthrough;
  }

  // PWA assets must be served unauthenticated so the browser can register
  // the service worker and read the manifest before the user logs in.
  const p = request.nextUrl.pathname;
  if (p === "/sw.js" || p === "/sw.js.map" || p === "/manifest.json" || p.startsWith("/workbox-")) {
    const passthrough = NextResponse.next();
    for (const [k, v] of Object.entries(securityHeaders)) passthrough.headers.set(k, v);
    return passthrough;
  }

  const response = await updateSession(request);
  for (const [k, v] of Object.entries(securityHeaders)) response.headers.set(k, v);
  return response;
}

export const config = {
  // Run on every path except static assets, the favicon, and Next internals.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
