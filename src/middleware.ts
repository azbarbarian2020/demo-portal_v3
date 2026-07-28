import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Never rewrite these paths — they belong to the portal itself
  if (
    path.startsWith("/apps/") ||
    path.startsWith("/admin") ||
    path.startsWith("/api/") ||
    path.startsWith("/logo") ||
    path.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  // If a demo iframe set the active_demo cookie, rewrite bare paths
  // (e.g. / → /apps/slug/) so Next.js client-side navigation from
  // within the iframe stays under the proxy prefix.
  const activeDemo = request.cookies.get("active_demo")?.value;
  if (!activeDemo) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = `/apps/${activeDemo}${path}`;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/((?!_next|favicon.ico).*)"],
};
