import { NextRequest, NextResponse } from "next/server";
import { executeQuery } from "@/lib/snowflake";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const from = params.get("from");
    const to = params.get("to");
    const user = params.get("user");

    // Build WHERE clause for filters
    const conditions: string[] = [];
    const binds: (string | number)[] = [];

    if (from) {
      conditions.push("l.started_at >= ?");
      binds.push(from);
    }
    if (to) {
      conditions.push("l.started_at <= ? || ' 23:59:59'");
      binds.push(to);
    }
    if (user) {
      conditions.push("l.user_name ILIKE ?");
      binds.push(`%${user}%`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Summary metrics
    const summaryRows = await executeQuery<Record<string, unknown>>(
      `SELECT 
         COUNT(*) AS total_sessions,
         COUNT(DISTINCT l.user_name) AS unique_users,
         COALESCE(ROUND(AVG(l.duration_seconds) / 60.0, 1), 0) AS avg_duration_minutes,
         COUNT(DISTINCT l.demo_id) AS total_demos
       FROM DEMO_PORTAL.PUBLIC.DEMO_USAGE_LOG l
       ${where}`,
      binds
    );

    // Usage by demo
    const usageByDemo = await executeQuery<Record<string, unknown>>(
      `SELECT 
         l.demo_id,
         d.name,
         COUNT(*) AS launch_count,
         COALESCE(ROUND(SUM(l.duration_seconds) / 60.0, 1), 0) AS total_minutes,
         COUNT(DISTINCT l.user_name) AS unique_users
       FROM DEMO_PORTAL.PUBLIC.DEMO_USAGE_LOG l
       JOIN DEMO_PORTAL.PUBLIC.DEMOS d ON l.demo_id = d.id
       ${where}
       GROUP BY l.demo_id, d.name
       ORDER BY launch_count DESC`,
      binds
    );

    // Usage over time (daily)
    const usageOverTime = await executeQuery<Record<string, unknown>>(
      `SELECT 
         TO_CHAR(l.started_at, 'YYYY-MM-DD') AS date,
         COUNT(*) AS launch_count
       FROM DEMO_PORTAL.PUBLIC.DEMO_USAGE_LOG l
       ${where}
       GROUP BY date
       ORDER BY date ASC`,
      binds
    );

    // Top users
    const topUsers = await executeQuery<Record<string, unknown>>(
      `SELECT 
         l.user_name,
         COUNT(*) AS launch_count,
         COALESCE(ROUND(SUM(l.duration_seconds) / 60.0, 1), 0) AS total_minutes
       FROM DEMO_PORTAL.PUBLIC.DEMO_USAGE_LOG l
       ${where}
       GROUP BY l.user_name
       ORDER BY launch_count DESC
       LIMIT 20`,
      binds
    );

    // Duration distribution
    const durationDist = await executeQuery<Record<string, unknown>>(
      `SELECT 
         CASE
           WHEN duration_seconds IS NULL THEN 'Active'
           WHEN duration_seconds < 300 THEN '0-5m'
           WHEN duration_seconds < 900 THEN '5-15m'
           WHEN duration_seconds < 1800 THEN '15-30m'
           ELSE '30m+'
         END AS bucket,
         COUNT(*) AS count
       FROM DEMO_PORTAL.PUBLIC.DEMO_USAGE_LOG l
       ${where}
       GROUP BY bucket
       ORDER BY CASE bucket
         WHEN 'Active' THEN 0
         WHEN '0-5m' THEN 1
         WHEN '5-15m' THEN 2
         WHEN '15-30m' THEN 3
         WHEN '30m+' THEN 4
       END`,
      binds
    );

    // Topic popularity (LATERAL FLATTEN on DEMOS.topics array)
    const topicPop = await executeQuery<Record<string, unknown>>(
      `SELECT 
         t.value::STRING AS topic,
         COUNT(*) AS launch_count
       FROM DEMO_PORTAL.PUBLIC.DEMO_USAGE_LOG l
       JOIN DEMO_PORTAL.PUBLIC.DEMOS d ON l.demo_id = d.id,
       LATERAL FLATTEN(input => d.topics) t
       ${where}
       GROUP BY topic
       ORDER BY launch_count DESC`,
      binds
    );

    // Capability popularity
    const capPop = await executeQuery<Record<string, unknown>>(
      `SELECT 
         c.value::STRING AS capability,
         COUNT(*) AS launch_count
       FROM DEMO_PORTAL.PUBLIC.DEMO_USAGE_LOG l
       JOIN DEMO_PORTAL.PUBLIC.DEMOS d ON l.demo_id = d.id,
       LATERAL FLATTEN(input => d.capabilities) c
       ${where}
       GROUP BY capability
       ORDER BY launch_count DESC`,
      binds
    );

    const summary = summaryRows[0] || {};

    return NextResponse.json({
      summary: {
        totalSessions: summary.TOTAL_SESSIONS ?? 0,
        uniqueUsers: summary.UNIQUE_USERS ?? 0,
        avgDurationMinutes: summary.AVG_DURATION_MINUTES ?? 0,
        totalDemos: summary.TOTAL_DEMOS ?? 0,
      },
      usageByDemo: usageByDemo.map((r) => ({
        demo_id: r.DEMO_ID,
        name: r.NAME,
        launch_count: r.LAUNCH_COUNT,
        total_minutes: r.TOTAL_MINUTES,
        unique_users: r.UNIQUE_USERS,
      })),
      usageOverTime: usageOverTime.map((r) => ({
        date: r.DATE,
        launch_count: r.LAUNCH_COUNT,
      })),
      topUsers: topUsers.map((r) => ({
        user_name: r.USER_NAME,
        launch_count: r.LAUNCH_COUNT,
        total_minutes: r.TOTAL_MINUTES,
      })),
      durationDistribution: durationDist.map((r) => ({
        bucket: r.BUCKET,
        count: r.COUNT,
      })),
      topicPopularity: topicPop.map((r) => ({
        topic: r.TOPIC,
        launch_count: r.LAUNCH_COUNT,
      })),
      capabilityPopularity: capPop.map((r) => ({
        capability: r.CAPABILITY,
        launch_count: r.LAUNCH_COUNT,
      })),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
