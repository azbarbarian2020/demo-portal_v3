import { NextResponse } from "next/server";
import { executeQuery } from "@/lib/snowflake";

export async function GET() {
  try {
    const rows = await executeQuery<Record<string, unknown>>(
      `SELECT key, value FROM DEMO_PORTAL.PUBLIC.SETTINGS WHERE key IN ('topics', 'capabilities', 'portal_title', 'portal_logo')`
    );

    const settings: Record<string, unknown> = { topics: [], capabilities: [] };
    for (const row of rows) {
      const key = row.KEY as string;
      const value = row.VALUE;
      if (key === "topics" || key === "capabilities") {
        settings[key] = Array.isArray(value) ? value : JSON.parse(value as string);
      } else if (key === "portal_title" || key === "portal_logo") {
        // These are stored as JSON strings e.g. "\"My Title\""
        settings[key] = typeof value === "string" ? JSON.parse(value) : value;
      }
    }

    return NextResponse.json(settings);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { topics, capabilities, portal_title, portal_logo } = body;

    if (topics !== undefined) {
      await executeQuery(
        `MERGE INTO DEMO_PORTAL.PUBLIC.SETTINGS t
         USING (SELECT 'topics' AS key) s ON t.key = s.key
         WHEN MATCHED THEN UPDATE SET value = PARSE_JSON('${JSON.stringify(topics).replace(/'/g, "''")}')
         WHEN NOT MATCHED THEN INSERT (key, value) VALUES ('topics', PARSE_JSON('${JSON.stringify(topics).replace(/'/g, "''")}'))`
      );
    }

    if (capabilities !== undefined) {
      await executeQuery(
        `MERGE INTO DEMO_PORTAL.PUBLIC.SETTINGS t
         USING (SELECT 'capabilities' AS key) s ON t.key = s.key
         WHEN MATCHED THEN UPDATE SET value = PARSE_JSON('${JSON.stringify(capabilities).replace(/'/g, "''")}')
         WHEN NOT MATCHED THEN INSERT (key, value) VALUES ('capabilities', PARSE_JSON('${JSON.stringify(capabilities).replace(/'/g, "''")}'))`
      );
    }

    if (portal_title !== undefined) {
      const escaped = JSON.stringify(portal_title).replace(/'/g, "''");
      await executeQuery(
        `MERGE INTO DEMO_PORTAL.PUBLIC.SETTINGS t
         USING (SELECT 'portal_title' AS key) s ON t.key = s.key
         WHEN MATCHED THEN UPDATE SET value = PARSE_JSON('${escaped}')
         WHEN NOT MATCHED THEN INSERT (key, value) VALUES ('portal_title', PARSE_JSON('${escaped}'))`
      );
    }

    if (portal_logo !== undefined) {
      const escaped = JSON.stringify(portal_logo).replace(/'/g, "''");
      await executeQuery(
        `MERGE INTO DEMO_PORTAL.PUBLIC.SETTINGS t
         USING (SELECT 'portal_logo' AS key) s ON t.key = s.key
         WHEN MATCHED THEN UPDATE SET value = PARSE_JSON('${escaped}')
         WHEN NOT MATCHED THEN INSERT (key, value) VALUES ('portal_logo', PARSE_JSON('${escaped}'))`
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
