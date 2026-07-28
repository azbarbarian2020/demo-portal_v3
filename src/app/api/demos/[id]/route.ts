import { NextResponse } from "next/server";
import { executeQuery, generatePresignedUrl } from "@/lib/snowflake";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const rows = await executeQuery<Record<string, unknown>>(
      `SELECT * FROM DEMO_PORTAL.PUBLIC.DEMOS WHERE id = ?`,
      [parseInt(id)]
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const row = rows[0];
    let thumbnail_url: string | undefined;
    const thumbPath = row.THUMBNAIL_STAGE_PATH as string | null;
    if (thumbPath) {
      try {
        thumbnail_url = await generatePresignedUrl(thumbPath, "DEMO_PORTAL.PUBLIC.IMAGES_STAGE");
      } catch {
        thumbnail_url = undefined;
      }
    }

    return NextResponse.json({
      id: row.ID,
      name: row.NAME,
      description: row.DESCRIPTION,
      short_description: row.SHORT_DESCRIPTION,
      thumbnail_stage_path: thumbPath,
      thumbnail_url,
      entry_url: row.ENTRY_URL,
      demo_type: row.DEMO_TYPE,
      topics: row.TOPICS || [],
      capabilities: row.CAPABILITIES || [],
      click_script_stage_path: row.CLICK_SCRIPT_STAGE_PATH,
      video_url: row.VIDEO_URL,
      status: row.STATUS,
      sort_order: row.SORT_ORDER,
      created_at: row.CREATED_AT,
      updated_at: row.UPDATED_AT,
      created_by: row.CREATED_BY,
      internal_host: row.INTERNAL_HOST || null,
      proxy_path: row.PROXY_PATH || null,
      idle_timeout_minutes: row.IDLE_TIMEOUT_MINUTES ?? 15,
      service_name: row.SERVICE_NAME || null,
      compute_pool: row.COMPUTE_POOL || null,
      schedule_start: row.SCHEDULE_START || null,
      schedule_stop: row.SCHEDULE_STOP || null,
      schedule_days: row.SCHEDULE_DAYS || null,
      schedule_timezone: row.SCHEDULE_TIMEZONE || null,
      auto_resume_enabled: row.AUTO_RESUME_ENABLED ?? false,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const numericId = parseInt(id, 10);
  if (isNaN(numericId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  try {
    // Drop any scheduled tasks for this demo before deleting
    const startTask = `DEMO_${numericId}_START`;
    const stopTask = `DEMO_${numericId}_STOP`;
    try {
      await executeQuery(`ALTER TASK IF EXISTS DEMO_PORTAL.PUBLIC.${startTask} SUSPEND`);
      await executeQuery(`ALTER TASK IF EXISTS DEMO_PORTAL.PUBLIC.${stopTask} SUSPEND`);
    } catch { /* tasks may not exist */ }
    await executeQuery(`DROP TASK IF EXISTS DEMO_PORTAL.PUBLIC.${startTask}`);
    await executeQuery(`DROP TASK IF EXISTS DEMO_PORTAL.PUBLIC.${stopTask}`);

    await executeQuery(
      `DELETE FROM DEMO_PORTAL.PUBLIC.DEMO_SESSIONS WHERE demo_id = ?`,
      [numericId]
    );
    await executeQuery(
      `DELETE FROM DEMO_PORTAL.PUBLIC.DEMOS WHERE id = ?`,
      [numericId]
    );
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const fields: string[] = [];
    const values: (string | number | null)[] = [];

    const updatable = [
      "name", "description", "short_description", "entry_url", "demo_type",
      "thumbnail_stage_path", "click_script_stage_path", "video_url", "status", "sort_order",
      "internal_host", "proxy_path", "idle_timeout_minutes",
      "service_name", "compute_pool", "schedule_start", "schedule_stop",
      "schedule_days", "schedule_timezone", "auto_resume_enabled",
    ];

    const nullableStringFields = ["internal_host", "proxy_path", "service_name", "compute_pool",
      "schedule_start", "schedule_stop", "schedule_days", "schedule_timezone"];

    for (const field of updatable) {
      if (body[field] !== undefined) {
        const value = nullableStringFields.includes(field) && body[field] === ""
          ? null
          : body[field];
        fields.push(`${field} = ?`);
        values.push(value);
      }
    }

    if (body.topics !== undefined) {
      fields.push("topics = PARSE_JSON(?)");
      values.push(JSON.stringify(body.topics));
    }
    if (body.capabilities !== undefined) {
      fields.push("capabilities = PARSE_JSON(?)");
      values.push(JSON.stringify(body.capabilities));
    }

    fields.push("updated_at = CURRENT_TIMESTAMP()");
    values.push(parseInt(id));

    await executeQuery(
      `UPDATE DEMO_PORTAL.PUBLIC.DEMOS SET ${fields.join(", ")} WHERE id = ?`,
      values
    );

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
