import { NextResponse } from "next/server";
import { executeQuery } from "@/lib/snowflake";
import { Demo } from "@/lib/types";

export async function GET() {
  try {
    const rows = await executeQuery<Record<string, unknown>>(
      `SELECT id, name, description, short_description, thumbnail_stage_path,
              entry_url, demo_type, topics, capabilities,
              click_script_stage_path, video_url, status, sort_order,
              created_at, updated_at, created_by,
              internal_host, proxy_path, idle_timeout_minutes,
              service_name, compute_pool, schedule_start, schedule_stop,
              schedule_days, schedule_timezone, auto_resume_enabled
       FROM DEMO_PORTAL.PUBLIC.DEMOS
       ORDER BY sort_order ASC, created_at DESC`
    );

    // Get live service statuses in one batch call
    let serviceStatuses: Record<string, string> = {};
    try {
      const svcRows = await executeQuery<Record<string, unknown>>(
        `SHOW SERVICES IN ACCOUNT`
      );
      for (const svc of svcRows) {
        const fqn = `${svc.database_name}.${svc.schema_name}.${svc.name}`;
        serviceStatuses[fqn] = svc.status as string;
      }
    } catch {
      // Non-critical — badges just won't show
    }

    const demos: Demo[] = rows.map((row) => {
      const thumbPath = row.THUMBNAIL_STAGE_PATH as string | null;
      const thumbnail_url = thumbPath
        ? `/api/image?path=${encodeURIComponent(thumbPath)}`
        : undefined;

      const serviceName = (row.SERVICE_NAME as string) || null;
      const serviceStatus = serviceName ? serviceStatuses[serviceName] || null : null;

      return {
        id: row.ID as number,
        name: row.NAME as string,
        description: row.DESCRIPTION as string,
        short_description: row.SHORT_DESCRIPTION as string,
        thumbnail_stage_path: thumbPath,
        thumbnail_url,
        entry_url: (row.ENTRY_URL as string) || null,
        demo_type: row.DEMO_TYPE as "SPCS" | "STREAMLIT",
        topics: (row.TOPICS as string[]) || [],
        capabilities: (row.CAPABILITIES as string[]) || [],
        click_script_stage_path: row.CLICK_SCRIPT_STAGE_PATH as string | null,
        video_url: row.VIDEO_URL as string | null,
        status: row.STATUS as "PUBLISHED" | "DRAFT" | "DISABLED",
        sort_order: row.SORT_ORDER as number,
        created_at: row.CREATED_AT as string,
        updated_at: row.UPDATED_AT as string,
        created_by: row.CREATED_BY as string | null,
        internal_host: row.INTERNAL_HOST as string | null,
        proxy_path: row.PROXY_PATH as string | null,
        idle_timeout_minutes: (row.IDLE_TIMEOUT_MINUTES as number) ?? 15,
        service_name: serviceName,
        compute_pool: (row.COMPUTE_POOL as string) || null,
        schedule_start: (row.SCHEDULE_START as string) || null,
        schedule_stop: (row.SCHEDULE_STOP as string) || null,
        schedule_days: (row.SCHEDULE_DAYS as string) || null,
        schedule_timezone: (row.SCHEDULE_TIMEZONE as string) || null,
        auto_resume_enabled: (row.AUTO_RESUME_ENABLED as boolean) ?? false,
        service_status: serviceStatus || undefined,
      };
    });

    return NextResponse.json(demos);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      name, description, short_description, entry_url, demo_type,
      topics, capabilities, thumbnail_stage_path, click_script_stage_path,
      video_url, status, sort_order, internal_host, proxy_path, idle_timeout_minutes,
      service_name, compute_pool, schedule_start, schedule_stop,
      schedule_days, schedule_timezone, auto_resume_enabled,
    } = body;

    await executeQuery(
      `INSERT INTO DEMO_PORTAL.PUBLIC.DEMOS
        (name, description, short_description, entry_url, demo_type,
         topics, capabilities, thumbnail_stage_path, click_script_stage_path,
         video_url, status, sort_order, created_by, internal_host, proxy_path, idle_timeout_minutes,
         service_name, compute_pool, schedule_start, schedule_stop,
         schedule_days, schedule_timezone, auto_resume_enabled)
       SELECT ?, ?, ?, ?, ?, PARSE_JSON(?), PARSE_JSON(?), ?, ?, ?, ?, ?, 'ADMIN', ?, ?, ?,
              ?, ?, ?, ?, ?, ?, ?`,
      [
        name,
        description || null,
        short_description || null,
        entry_url,
        demo_type || "SPCS",
        JSON.stringify(topics || []),
        JSON.stringify(capabilities || []),
        thumbnail_stage_path || null,
        click_script_stage_path || null,
        video_url || null,
        status || "PUBLISHED",
        sort_order || 0,
        internal_host || null,
        proxy_path || null,
        idle_timeout_minutes ?? 15,
        service_name || null,
        compute_pool || null,
        schedule_start || null,
        schedule_stop || null,
        schedule_days || null,
        schedule_timezone || null,
        auto_resume_enabled ?? false,
      ]
    );

    const inserted = await executeQuery<{ ID: number }>(
      `SELECT MAX(id) AS ID FROM DEMO_PORTAL.PUBLIC.DEMOS WHERE name = ?`,
      [name]
    );

    return NextResponse.json({ id: inserted[0]?.ID, success: true }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("POST /api/demos error:", message);
    return NextResponse.json({ error: `Failed to create demo: ${message}` }, { status: 500 });
  }
}
