import { NextResponse } from "next/server";
import { executeQuery } from "@/lib/snowflake";

export async function GET() {
  try {
    const rows = await executeQuery<Record<string, unknown>>(
      `SHOW SERVICES IN ACCOUNT`
    );

    // Filter to non-system, non-managed services (user-created SPCS apps)
    const services = rows
      .filter((row) => {
        const managingDomain = (row.managing_object_domain as string) || "";
        const owner = (row.owner as string) || "";
        // Exclude Streamlit-managed and system-managed services
        return managingDomain === "" && owner !== "SYSTEM$MANAGED";
      })
      .map((row) => {
        const name = row.name as string;
        const db = row.database_name as string;
        const schema = row.schema_name as string;
        const dnsName = row.dns_name as string;
        const status = row.status as string;
        return {
          name,
          database_name: db,
          schema_name: schema,
          fully_qualified: `${db}.${schema}.${name}`,
          dns_name: dnsName,
          status,
        };
      });

    return NextResponse.json(services);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to list services";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
