import { NextRequest, NextResponse } from "next/server";
import { executeQuery } from "@/lib/snowflake";

export const maxDuration = 120;

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const demoId = parseInt(id, 10);
    if (isNaN(demoId)) {
      return NextResponse.json({ error: "Invalid demo ID" }, { status: 400 });
    }

    const rows = await executeQuery<Record<string, unknown>>(
      `SELECT service_name, compute_pool, auto_resume_enabled
       FROM DEMO_PORTAL.PUBLIC.DEMOS WHERE id = ?`,
      [demoId]
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "Demo not found" }, { status: 404 });
    }

    const demo = rows[0];
    const serviceName = demo.SERVICE_NAME as string | null;
    const computePool = demo.COMPUTE_POOL as string | null;
    const autoResume = demo.AUTO_RESUME_ENABLED as boolean;

    if (!serviceName) {
      return NextResponse.json({ error: "No service_name configured" }, { status: 400 });
    }

    if (!autoResume) {
      return NextResponse.json({ error: "Auto-resume is not enabled for this demo" }, { status: 403 });
    }

    // Ensure DEMO_PORTAL_ROLE has OPERATE/MONITOR on the service and pool
    try {
      await executeQuery(
        `CALL DEMO_PORTAL.PUBLIC.GRANT_DEMO_ACCESS(?, ?)`,
        [serviceName, computePool || ""]
      );
    } catch {
      // Non-fatal
    }

    // Resume compute pool first (if configured)
    if (computePool) {
      try {
        await executeQuery(`ALTER COMPUTE POOL ${computePool} RESUME`);
      } catch {
        // May already be running
      }
    }

    // Resume the service
    try {
      await executeQuery(`ALTER SERVICE ${serviceName} RESUME`);
    } catch {
      // May already be running
    }

    // Poll until READY (max 90 seconds)
    const maxAttempts = 18;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      try {
        const statusRows = await executeQuery<Record<string, unknown>>(
          `SELECT SYSTEM$GET_SERVICE_STATUS('${serviceName}') AS status`
        );
        const statusJson = JSON.parse(statusRows[0].STATUS as string);
        if (statusJson[0]?.status === "READY") {
          return NextResponse.json({ success: true, status: "READY" });
        }
      } catch {
        // Keep trying
      }
    }

    return NextResponse.json({ success: true, status: "STARTING", message: "Service is resuming but not yet ready" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: `Failed to resume: ${message}` }, { status: 500 });
  }
}
