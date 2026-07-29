import { NextResponse } from "next/server";
import { writeFile, unlink, mkdir } from "fs/promises";
import { join } from "path";
import { uploadToStage, executeQuery } from "@/lib/snowflake";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Use a fixed filename with timestamp to bust cache
    const ext = file.name.split(".").pop() || "png";
    const safeFileName = `logo.${ext}`;

    const tmpDir = join(process.cwd(), "tmp");
    await mkdir(tmpDir, { recursive: true });
    const tmpPath = join(tmpDir, safeFileName);

    const bytes = await file.arrayBuffer();
    await writeFile(tmpPath, Buffer.from(bytes));

    const destDir = "portal";
    const stageName = "DEMO_PORTAL.PUBLIC.IMAGES_STAGE";

    try {
      await uploadToStage(stageName, tmpPath, destDir);
    } finally {
      await unlink(tmpPath).catch(() => {});
    }

    const logoPath = `portal/${safeFileName}`;

    // Update the portal_logo setting
    const escaped = JSON.stringify(logoPath).replace(/'/g, "''");
    await executeQuery(
      `MERGE INTO DEMO_PORTAL.PUBLIC.SETTINGS t
       USING (SELECT 'portal_logo' AS key) s ON t.key = s.key
       WHEN MATCHED THEN UPDATE SET value = PARSE_JSON('${escaped}')
       WHEN NOT MATCHED THEN INSERT (key, value) VALUES ('portal_logo', PARSE_JSON('${escaped}'))`
    );

    return NextResponse.json({ success: true, path: logoPath });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
