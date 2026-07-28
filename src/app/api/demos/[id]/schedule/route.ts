import { NextRequest, NextResponse } from "next/server";
import { executeQuery } from "@/lib/snowflake";

interface DemoRow {
  ID: number;
  SERVICE_NAME: string | null;
  COMPUTE_POOL: string | null;
  SCHEDULE_START: string | null;
  SCHEDULE_STOP: string | null;
  SCHEDULE_DAYS: string | null;
  SCHEDULE_TIMEZONE: string | null;
  AUTO_RESUME_ENABLED: boolean;
}

function parseCronTime(time: string): { hour: string; minute: string } {
  const [h, m] = time.split(":");
  return { hour: h.replace(/^0/, ""), minute: m };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const demoId = parseInt(id, 10);
    if (isNaN(demoId)) {
      return NextResponse.json({ error: "Invalid demo ID" }, { status: 400 });
    }

    const rows = await executeQuery<DemoRow>(
      `SELECT id, service_name, compute_pool, schedule_start, schedule_stop,
              schedule_days, schedule_timezone, auto_resume_enabled
       FROM DEMO_PORTAL.PUBLIC.DEMOS WHERE id = ?`,
      [demoId]
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "Demo not found" }, { status: 404 });
    }

    const demo = rows[0];
    const startTaskName = `DEMO_${demoId}_START`;
    const stopTaskName = `DEMO_${demoId}_STOP`;

    // Drop existing tasks for this demo ID
    try {
      await executeQuery(`ALTER TASK IF EXISTS DEMO_PORTAL.PUBLIC.${startTaskName} SUSPEND`);
      await executeQuery(`ALTER TASK IF EXISTS DEMO_PORTAL.PUBLIC.${stopTaskName} SUSPEND`);
    } catch { /* may not exist */ }
    await executeQuery(`DROP TASK IF EXISTS DEMO_PORTAL.PUBLIC.${startTaskName}`);
    await executeQuery(`DROP TASK IF EXISTS DEMO_PORTAL.PUBLIC.${stopTaskName}`);

    // Also drop orphan tasks from other demo IDs targeting the same service
    if (demo.SERVICE_NAME) {
      try {
        const tasks = await executeQuery<{ name: string; definition: string }>(
          `SHOW TASKS IN SCHEMA DEMO_PORTAL.PUBLIC`
        );
        for (const task of tasks) {
          if (
            task.name !== startTaskName &&
            task.name !== stopTaskName &&
            task.name.match(/^DEMO_\d+_(START|STOP)$/) &&
            task.definition?.includes(demo.SERVICE_NAME!)
          ) {
            try {
              await executeQuery(`ALTER TASK DEMO_PORTAL.PUBLIC.${task.name} SUSPEND`);
            } catch { /* ignore */ }
            await executeQuery(`DROP TASK IF EXISTS DEMO_PORTAL.PUBLIC.${task.name}`);
          }
        }
      } catch { /* non-fatal — orphan cleanup is best-effort */ }
    }

    // If no schedule configured, we're done (tasks cleaned up)
    if (!demo.SERVICE_NAME || !demo.SCHEDULE_START || !demo.SCHEDULE_STOP || !demo.SCHEDULE_DAYS) {
      return NextResponse.json({ success: true, message: "Schedule cleared (no tasks created)" });
    }

    const serviceName = demo.SERVICE_NAME;
    const computePool = demo.COMPUTE_POOL;
    const days = demo.SCHEDULE_DAYS;
    const timezone = demo.SCHEDULE_TIMEZONE || "America/Los_Angeles";
    const start = parseCronTime(demo.SCHEDULE_START);
    const stop = parseCronTime(demo.SCHEDULE_STOP);

    // Ensure DEMO_PORTAL_ROLE has OPERATE/MONITOR on the service and pool
    try {
      await executeQuery(
        `CALL DEMO_PORTAL.PUBLIC.GRANT_DEMO_ACCESS(?, ?)`,
        [serviceName, computePool || ""]
      );
    } catch {
      // Non-fatal — grants may already exist or procedure may not be available
    }

    // Create START task
    const startCron = `${start.minute} ${start.hour} * * ${days}`;
    let startBody = `BEGIN
              ALTER SERVICE ${serviceName} RESUME;
            END`;
    if (computePool) {
      startBody = `BEGIN
              ALTER COMPUTE POOL ${computePool} RESUME;
              ALTER SERVICE ${serviceName} RESUME;
            END`;
    }

    await executeQuery(
      `CREATE TASK DEMO_PORTAL.PUBLIC.${startTaskName}
        WAREHOUSE = DEMO_PORTAL_WH
        SCHEDULE = 'USING CRON ${startCron} ${timezone}'
       AS ${startBody}`
    );

    // Create STOP task
    const stopCron = `${stop.minute} ${stop.hour} * * ${days}`;
    let stopBody: string;
    if (computePool) {
      stopBody = `BEGIN
              ALTER SERVICE ${serviceName} SUSPEND;
              LET status VARCHAR := 'SUSPENDING';
              LET attempts INTEGER := 0;
              WHILE (:status != 'SUSPENDED' AND :attempts < 20) DO
                CALL SYSTEM$WAIT(5);
                LET result VARCHAR := (SELECT SYSTEM$GET_SERVICE_STATUS('${serviceName}'));
                status := (SELECT PARSE_JSON(:result)[0]:status::VARCHAR);
                attempts := :attempts + 1;
              END WHILE;
              ALTER COMPUTE POOL ${computePool} SUSPEND;
            END`;
    } else {
      stopBody = `BEGIN
              ALTER SERVICE ${serviceName} SUSPEND;
            END`;
    }

    await executeQuery(
      `CREATE TASK DEMO_PORTAL.PUBLIC.${stopTaskName}
        WAREHOUSE = DEMO_PORTAL_WH
        SCHEDULE = 'USING CRON ${stopCron} ${timezone}'
       AS ${stopBody}`
    );

    // Resume both tasks so they're active
    await executeQuery(`ALTER TASK DEMO_PORTAL.PUBLIC.${startTaskName} RESUME`);
    await executeQuery(`ALTER TASK DEMO_PORTAL.PUBLIC.${stopTaskName} RESUME`);

    return NextResponse.json({
      success: true,
      tasks_created: [startTaskName, stopTaskName],
      start_cron: `${startCron} ${timezone}`,
      stop_cron: `${stopCron} ${timezone}`,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("POST /api/demos/[id]/schedule error:", message);
    return NextResponse.json({ error: `Failed to create schedule: ${message}` }, { status: 500 });
  }
}
