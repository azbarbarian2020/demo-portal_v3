import { NextResponse } from "next/server";
import { executeQuery } from "@/lib/snowflake";
import { headers } from "next/headers";

function getCurrentUser(reqHeaders: Headers): string {
  return reqHeaders.get("sf-context-current-user") || reqHeaders.get("x-forwarded-user") || "UNKNOWN";
}

// Fire-and-forget usage logging — never blocks or breaks core session flow
async function logUsageEvent(demo_id: number, user: string, type: "launch" | "end") {
  try {
    if (type === "launch") {
      // Only insert if there's no open session for this user+demo
      await executeQuery(
        `INSERT INTO DEMO_PORTAL.PUBLIC.DEMO_USAGE_LOG (demo_id, user_name, event_type, started_at)
         SELECT ?, ?, 'launch', CURRENT_TIMESTAMP()
         WHERE NOT EXISTS (
           SELECT 1 FROM DEMO_PORTAL.PUBLIC.DEMO_USAGE_LOG
           WHERE demo_id = ? AND user_name = ? AND ended_at IS NULL
         )`,
        [demo_id, user, demo_id, user]
      );
    } else {
      await executeQuery(
        `UPDATE DEMO_PORTAL.PUBLIC.DEMO_USAGE_LOG
         SET event_type = 'end',
             ended_at = CURRENT_TIMESTAMP(),
             duration_seconds = DATEDIFF('second', started_at, CURRENT_TIMESTAMP())
         WHERE demo_id = ? AND user_name = ? AND ended_at IS NULL`,
        [demo_id, user]
      );
    }
  } catch {
    // Analytics logging must never break session management
  }
}

async function closeExpiredUsageLogs() {
  try {
    await executeQuery(
      `UPDATE DEMO_PORTAL.PUBLIC.DEMO_USAGE_LOG l
       SET l.event_type = 'expired',
           l.ended_at = l.started_at + INTERVAL '1 MINUTE' * d.idle_timeout_minutes,
           l.duration_seconds = d.idle_timeout_minutes * 60
       FROM DEMO_PORTAL.PUBLIC.DEMOS d
       WHERE l.demo_id = d.id
         AND l.ended_at IS NULL
         AND l.demo_id NOT IN (SELECT demo_id FROM DEMO_PORTAL.PUBLIC.DEMO_SESSIONS)`
    );
  } catch {
    // Non-fatal
  }
}

export async function GET() {
  try {
    // Clean up expired sessions first
    await executeQuery(
      `DELETE FROM DEMO_PORTAL.PUBLIC.DEMO_SESSIONS s
       USING DEMO_PORTAL.PUBLIC.DEMOS d
       WHERE s.demo_id = d.id
         AND DATEDIFF('minute', s.last_activity, CURRENT_TIMESTAMP()) > d.idle_timeout_minutes`
    );

    // Clean up orphaned sessions (demo was deleted while session was active)
    await executeQuery(
      `DELETE FROM DEMO_PORTAL.PUBLIC.DEMO_SESSIONS WHERE demo_id NOT IN (SELECT id FROM DEMO_PORTAL.PUBLIC.DEMOS)`
    );

    // Close any usage log entries that no longer have an active session
    await closeExpiredUsageLogs();

    const rows = await executeQuery<Record<string, unknown>>(
      `SELECT s.demo_id, s.locked_by, s.locked_at, s.last_activity,
              d.idle_timeout_minutes,
              DATEDIFF('second', s.last_activity, CURRENT_TIMESTAMP()) AS idle_seconds
       FROM DEMO_PORTAL.PUBLIC.DEMO_SESSIONS s
       JOIN DEMO_PORTAL.PUBLIC.DEMOS d ON s.demo_id = d.id`
    );

    const sessions = rows.map((row) => ({
      demo_id: row.DEMO_ID as number,
      locked_by: row.LOCKED_BY as string,
      locked_at: row.LOCKED_AT as string,
      last_activity: row.LAST_ACTIVITY as string,
      idle_timeout_minutes: row.IDLE_TIMEOUT_MINUTES as number,
      idle_seconds: row.IDLE_SECONDS as number,
    }));

    return NextResponse.json(sessions);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const headersList = await headers();
    const user = getCurrentUser(headersList);
    const body = await request.json();
    const { action, demo_id } = body;

    if (!demo_id && action !== "unlock_by_path") {
      return NextResponse.json({ error: "Missing demo_id" }, { status: 400 });
    }

    if (action === "lock") {
      // Check if already locked by someone else
      const existing = await executeQuery<Record<string, unknown>>(
        `SELECT locked_by FROM DEMO_PORTAL.PUBLIC.DEMO_SESSIONS WHERE demo_id = ?`,
        [demo_id]
      );

      if (existing.length > 0 && existing[0].LOCKED_BY !== user) {
        return NextResponse.json(
          { error: "Demo is locked", locked_by: existing[0].LOCKED_BY },
          { status: 409 }
        );
      }

      // Upsert the lock
      await executeQuery(
        `MERGE INTO DEMO_PORTAL.PUBLIC.DEMO_SESSIONS t
         USING (SELECT ? AS demo_id, ? AS locked_by) s
         ON t.demo_id = s.demo_id
         WHEN MATCHED THEN UPDATE SET locked_by = s.locked_by, last_activity = CURRENT_TIMESTAMP()
         WHEN NOT MATCHED THEN INSERT (demo_id, locked_by, locked_at, last_activity)
           VALUES (s.demo_id, s.locked_by, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())`,
        [demo_id, user]
      );

      // Log usage event (non-fatal)
      await logUsageEvent(demo_id, user, "launch");

      return NextResponse.json({ success: true, locked_by: user });
    }

    if (action === "unlock") {
      await executeQuery(
        `DELETE FROM DEMO_PORTAL.PUBLIC.DEMO_SESSIONS WHERE demo_id = ? AND locked_by = ?`,
        [demo_id, user]
      );
      // Log end event (non-fatal)
      await logUsageEvent(demo_id, user, "end");
      return NextResponse.json({ success: true });
    }

    if (action === "unlock_by_path") {
      const { proxy_path } = body;
      if (proxy_path) {
        // Get the demo_id before deleting so we can log it
        const demoRows = await executeQuery<Record<string, unknown>>(
          `SELECT id FROM DEMO_PORTAL.PUBLIC.DEMOS WHERE proxy_path = ?`,
          [proxy_path]
        );
        await executeQuery(
          `DELETE FROM DEMO_PORTAL.PUBLIC.DEMO_SESSIONS s
           USING DEMO_PORTAL.PUBLIC.DEMOS d
           WHERE s.demo_id = d.id AND d.proxy_path = ? AND s.locked_by = ?`,
          [proxy_path, user]
        );
        if (demoRows.length > 0) {
          await logUsageEvent(demoRows[0].ID as number, user, "end");
        }
      }
      return NextResponse.json({ success: true });
    }

    if (action === "heartbeat") {
      await executeQuery(
        `UPDATE DEMO_PORTAL.PUBLIC.DEMO_SESSIONS
         SET last_activity = CURRENT_TIMESTAMP()
         WHERE demo_id = ? AND locked_by = ?`,
        [demo_id, user]
      );
      return NextResponse.json({ success: true });
    }

    if (action === "heartbeat_by_path") {
      const { proxy_path } = body;
      if (proxy_path) {
        await executeQuery(
          `UPDATE DEMO_PORTAL.PUBLIC.DEMO_SESSIONS s
           SET s.last_activity = CURRENT_TIMESTAMP()
           FROM DEMO_PORTAL.PUBLIC.DEMOS d
           WHERE s.demo_id = d.id AND d.proxy_path = ? AND s.locked_by = ?`,
          [proxy_path, user]
        );
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
