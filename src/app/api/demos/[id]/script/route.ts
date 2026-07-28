import { NextResponse } from "next/server";
import { executeQuery, generatePresignedUrl } from "@/lib/snowflake";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const rows = await executeQuery<Record<string, unknown>>(
      `SELECT click_script_stage_path FROM DEMO_PORTAL.PUBLIC.DEMOS WHERE id = ?`,
      [parseInt(id)]
    );

    if (rows.length === 0 || !rows[0].CLICK_SCRIPT_STAGE_PATH) {
      return NextResponse.json({ error: "No script available" }, { status: 404 });
    }

    const stagePath = rows[0].CLICK_SCRIPT_STAGE_PATH as string;
    const url = await generatePresignedUrl(stagePath, "DEMO_PORTAL.PUBLIC.SCRIPTS_STAGE");

    if (!url) {
      return NextResponse.json({ error: "Could not generate download URL" }, { status: 500 });
    }

    const response = await fetch(url);
    if (!response.ok) {
      return new NextResponse("Failed to fetch file", { status: 502 });
    }

    const buffer = await response.arrayBuffer();
    const filename = stagePath.split("/").pop() || "click_script.pdf";

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
