import { NextRequest, NextResponse } from "next/server";
import { executeQuery } from "@/lib/snowflake";

export async function POST(request: NextRequest) {
  try {
    const { service_name } = await request.json();
    if (!service_name) {
      return NextResponse.json({ error: "service_name is required" }, { status: 400 });
    }

    // Parse fully qualified name: DB.SCHEMA.NAME
    const parts = service_name.split(".");
    if (parts.length !== 3) {
      return NextResponse.json({ error: "service_name must be fully qualified: DB.SCHEMA.NAME" }, { status: 400 });
    }
    const [db, schema, name] = parts;

    // Validate identifiers to prevent SQL injection (SHOW commands don't support bind params)
    const validId = /^[A-Za-z_][A-Za-z0-9_]*$/;
    if (!validId.test(db) || !validId.test(schema) || !validId.test(name)) {
      return NextResponse.json({ error: "Invalid characters in service name — use DB.SCHEMA.NAME format" }, { status: 400 });
    }

    // Get service DNS
    const services = await executeQuery<Record<string, unknown>>(
      `SHOW SERVICES LIKE '${name}' IN SCHEMA ${db}.${schema}`
    );

    if (services.length === 0) {
      return NextResponse.json({ error: `Service '${service_name}' not found` }, { status: 404 });
    }

    const service = services[0];
    const status = service.status as string;

    // Try to get endpoints (requires USAGE privilege)
    let port = 8080;
    let ingressUrl: string | null = null;
    try {
      const endpoints = await executeQuery<Record<string, unknown>>(
        `SHOW ENDPOINTS IN SERVICE ${db}.${schema}.${name}`
      );
      if (endpoints.length > 0) {
        // Take first endpoint — column names from SHOW are lowercase
        const ep = endpoints[0];
        const epPort = ep.port ?? ep.PORT;
        const epIngress = ep.ingress_url ?? ep.INGRESS_URL;
        if (epPort) port = Number(epPort);
        if (epIngress) ingressUrl = String(epIngress);
      }
    } catch {
      // SHOW ENDPOINTS requires USAGE; fall back to default port 8080
    }

    // Build cross-database DNS: <service>.<schema>.<database>.snowflakecomputing.internal
    const dnsDb = db.toLowerCase().replace(/_/g, "-");
    const dnsSchema = schema.toLowerCase().replace(/_/g, "-");
    const dnsService = name.toLowerCase().replace(/_/g, "-");
    const internalHost = `${dnsService}.${dnsSchema}.${dnsDb}.snowflakecomputing.internal:${port}`;

    const suggestedProxy = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    // Check for proxy_path conflicts
    const existing = await executeQuery<Record<string, unknown>>(
      `SELECT proxy_path FROM DEMO_PORTAL.PUBLIC.DEMOS WHERE proxy_path = ?`,
      [suggestedProxy]
    );
    const proxyPath = existing.length > 0 ? `${suggestedProxy}-2` : suggestedProxy;

    const computePool = (service.compute_pool ?? service.COMPUTE_POOL) as string || "";

    return NextResponse.json({
      internal_host: internalHost,
      suggested_proxy_path: proxyPath,
      entry_url: ingressUrl ? `https://${ingressUrl}` : "",
      service_status: status,
      service_name: `${db}.${schema}.${name}`,
      compute_pool: computePool,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Detection failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
