import { NextRequest, NextResponse } from "next/server";
import { executeQuery } from "@/lib/snowflake";

export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get("path");
  if (!path) {
    return NextResponse.json({ exists: false });
  }

  try {
    const rows = await executeQuery<Record<string, unknown>>(
      `SELECT proxy_path FROM DEMO_PORTAL.PUBLIC.DEMOS WHERE proxy_path = ?`,
      [path]
    );
    return NextResponse.json({ exists: rows.length > 0 });
  } catch {
    return NextResponse.json({ exists: false });
  }
}
