import { NextRequest, NextResponse } from "next/server";
import { executeQuery } from "@/lib/snowflake";

export async function POST(request: NextRequest) {
  try {
    const { streamlit_name } = await request.json();
    if (!streamlit_name) {
      return NextResponse.json({ error: "streamlit_name is required" }, { status: 400 });
    }

    // Parse fully qualified name: DB.SCHEMA.NAME
    const parts = streamlit_name.split(".");
    if (parts.length !== 3) {
      return NextResponse.json({ error: "streamlit_name must be fully qualified: DB.SCHEMA.NAME" }, { status: 400 });
    }
    const [db, schema, name] = parts;

    // Get Streamlit details (title, url_id)
    const streamlits = await executeQuery<Record<string, unknown>>(
      `SHOW STREAMLITS IN SCHEMA ${db}.${schema}`
    );

    const streamlit = streamlits.find(
      (s) => (s.name as string).toUpperCase() === name.toUpperCase()
    );

    if (!streamlit) {
      return NextResponse.json({ error: `Streamlit '${streamlit_name}' not found` }, { status: 404 });
    }

    const title = (streamlit.title as string) || name;
    const urlId = streamlit.url_id as string;
    // Derive Snowsight URL from account identifier (ORG-ACCOUNT format)
    const account = process.env.SNOWFLAKE_ACCOUNT || "";
    const [org, acct] = account.toLowerCase().split("-");
    const snowsightUrl = org && acct
      ? `https://app.snowflake.com/streamlit/${org}/${acct}/#/apps/${urlId}`
      : `https://app.snowflake.com/#/apps/${urlId}`;

    // Streamlit-in-Snowflake apps (both container and warehouse runtime) cannot be
    // proxied from other SPCS services due to network isolation of system-managed services.
    // They will open in a new tab but still support portal-side locking and timeout.
    return NextResponse.json({
      runtime: "streamlit-managed",
      embeddable: false,
      title,
      entry_url: snowsightUrl,
      message: "Streamlit apps open in a new tab (separate Snowflake login). The portal will still track who is using it with lock/release and idle timeout.",
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Detection failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
