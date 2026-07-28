import { NextResponse } from "next/server";
import { headers } from "next/headers";

export async function GET() {
  const headersList = await headers();
  const user = headersList.get("sf-context-current-user") || process.env.SNOWFLAKE_USER || "UNKNOWN";
  return NextResponse.json({ status: "ok", user });
}
