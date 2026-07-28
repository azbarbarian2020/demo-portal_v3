import { NextResponse } from "next/server";
import { executeQuery } from "@/lib/snowflake";

interface PortalSchedule {
  start_time: string;
  stop_time: string;
  days: string;
  timezone: string;
  compute_pool: string;
  service_name: string;
}

function parseCronTime(time: string): { hour: string; minute: string } {
  const [h, m] = time.split(":");
  return { hour: h.replace(/^0/, ""), minute: m };
}

export async function GET() {
  try {
    // Read current portal schedule from tasks
    const tasks = await executeQuery<Record<string, unknown>>(
      `SHOW TASKS LIKE 'PORTAL_%' IN DEMO_PORTAL.PUBLIC`
    );

    const startTask = tasks.find((t) => (t.name as string) === "PORTAL_START");
    const stopTask = tasks.find((t) => (t.name as string) === "PORTAL_STOP");

    if (!startTask || !stopTask) {
      return NextResponse.json({ configured: false });
    }

    // Parse CRON from schedule string: "USING CRON 00 05 * * MON,TUE,WED,THU,FRI America/Los_Angeles"
    const startSchedule = startTask.schedule as string;
    const stopSchedule = stopTask.schedule as string;

    const cronRegex = /USING CRON (\d+) (\d+) \* \* ([A-Z,]+) (.+)/;
    const startMatch = startSchedule.match(cronRegex);
    const stopMatch = stopSchedule.match(cronRegex);

    if (!startMatch || !stopMatch) {
      return NextResponse.json({ configured: true, parse_error: true });
    }

    return NextResponse.json({
      configured: true,
      start_time: `${startMatch[2].padStart(2, "0")}:${startMatch[1].padStart(2, "0")}`,
      stop_time: `${stopMatch[2].padStart(2, "0")}:${stopMatch[1].padStart(2, "0")}`,
      days: startMatch[3],
      timezone: startMatch[4],
      compute_pool: "DEMO_PORTAL_POOL",
      service_name: "DEMO_PORTAL.PUBLIC.DEMO_PORTAL_SVC",
      start_state: startTask.state as string,
      stop_state: stopTask.state as string,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body: PortalSchedule = await request.json();
    const { start_time, stop_time, days, timezone, compute_pool, service_name } = body;

    if (!start_time || !stop_time || !days) {
      return NextResponse.json({ error: "start_time, stop_time, and days are required" }, { status: 400 });
    }

    const start = parseCronTime(start_time);
    const stop = parseCronTime(stop_time);
    const pool = compute_pool || "DEMO_PORTAL_POOL";
    const svc = service_name || "DEMO_PORTAL.PUBLIC.DEMO_PORTAL_SVC";
    const tz = timezone || "America/Los_Angeles";

    // Suspend and drop existing tasks before recreating
    try {
      await executeQuery(`ALTER TASK IF EXISTS DEMO_PORTAL.PUBLIC.PORTAL_START SUSPEND`);
      await executeQuery(`ALTER TASK IF EXISTS DEMO_PORTAL.PUBLIC.PORTAL_STOP SUSPEND`);
    } catch { /* may not exist */ }
    await executeQuery(`DROP TASK IF EXISTS DEMO_PORTAL.PUBLIC.PORTAL_START`);
    await executeQuery(`DROP TASK IF EXISTS DEMO_PORTAL.PUBLIC.PORTAL_STOP`);

    await executeQuery(
      `CREATE TASK DEMO_PORTAL.PUBLIC.PORTAL_START
        WAREHOUSE = DEMO_PORTAL_WH
        SCHEDULE = 'USING CRON ${start.minute} ${start.hour} * * ${days} ${tz}'
       AS BEGIN
         ALTER COMPUTE POOL ${pool} RESUME;
         ALTER SERVICE ${svc} RESUME;
       END`
    );

    await executeQuery(
      `CREATE TASK DEMO_PORTAL.PUBLIC.PORTAL_STOP
        WAREHOUSE = DEMO_PORTAL_WH
        SCHEDULE = 'USING CRON ${stop.minute} ${stop.hour} * * ${days} ${tz}'
       AS BEGIN
         ALTER SERVICE ${svc} SUSPEND;
         LET status VARCHAR := 'SUSPENDING';
         LET attempts INTEGER := 0;
         WHILE (:status != 'SUSPENDED' AND :attempts < 20) DO
           CALL SYSTEM$WAIT(5);
           LET result VARCHAR := (SELECT SYSTEM$GET_SERVICE_STATUS('${svc}'));
           status := (SELECT PARSE_JSON(:result)[0]:status::VARCHAR);
           attempts := :attempts + 1;
         END WHILE;
         ALTER COMPUTE POOL ${pool} SUSPEND;
       END`
    );

    await executeQuery(`ALTER TASK DEMO_PORTAL.PUBLIC.PORTAL_START RESUME`);
    await executeQuery(`ALTER TASK DEMO_PORTAL.PUBLIC.PORTAL_STOP RESUME`);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: `Failed to update portal schedule: ${message}` }, { status: 500 });
  }
}
