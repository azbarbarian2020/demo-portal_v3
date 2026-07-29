import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Portal-owned paths: NEVER rewrite
  if (
    path === "/" ||
    path.startsWith("/apps/") ||
    path.startsWith("/admin") ||
    path.startsWith("/api/") ||
    path.startsWith("/logo") ||
    path.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  // For asset paths (e.g. /assets/...) that Vite apps reference:
  // rewrite through the proxy using the active_demo cookie
  const activeDemo = request.cookies.get("active_demo")?.value;
  if (!activeDemo) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = `/apps/${activeDemo}${path}`;
  return NextResponse.rewrite(url);
}

export const config = {
  // Only run middleware on paths that are NOT:
  // - _next (static assets, webpack, images)
  // - favicon.ico
  // - Root path / (matched as empty after leading /)
  // The middleware handles: /assets/*, /static/*, etc.
  matcher: ["/((?!_next|favicon.ico|$).+)"],
};
