import { NextRequest, NextResponse } from "next/server";

const PORTAL_API_PREFIXES = [
  "/api/sessions",
  "/api/demos",
  "/api/health",
  "/api/settings",
  "/api/upload",
  "/api/image",
  "/api/tiles",
  "/api/analytics",
  "/api/portal-schedule",
];

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  if (
    path === "/" ||
    path.startsWith("/apps/") ||
    path.startsWith("/admin") ||
    path.startsWith("/logo") ||
    path.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  // Only skip portal-owned API routes; proxied app APIs get rewritten
  if (path.startsWith("/api/") && PORTAL_API_PREFIXES.some((r) => path.startsWith(r))) {
    return NextResponse.next();
  }

  const activeDemo = request.cookies.get("active_demo")?.value;
  if (!activeDemo) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = `/apps/${activeDemo}${path}`;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/((?!_next/image|_next/webpack).*)"],
};
