import { NextResponse } from "next/server";
import { executeQuery } from "@/lib/snowflake";

export async function GET() {
  try {
    const rows = await executeQuery<Record<string, unknown>>(
      `SHOW STREAMLITS IN ACCOUNT`
    );

    const streamlits = rows.map((row) => ({
      name: row.name as string,
      database_name: row.database_name as string,
      schema_name: row.schema_name as string,
      title: (row.title as string) || (row.name as string),
      fully_qualified: `${row.database_name}.${row.schema_name}.${row.name}`,
    }));

    return NextResponse.json(streamlits);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to list Streamlits";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
