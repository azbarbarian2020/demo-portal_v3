import { NextResponse } from "next/server";
import { writeFile, unlink, mkdir } from "fs/promises";
import { join } from "path";
import { uploadToStage } from "@/lib/snowflake";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const stageType = formData.get("stageType") as string; // "images" or "scripts"
    const destPath = formData.get("destPath") as string; // e.g. "demo_1/screenshot.png"

    if (!file || !stageType || !destPath) {
      return NextResponse.json(
        { error: "Missing file, stageType, or destPath" },
        { status: 400 }
      );
    }

    const stageName = stageType === "images"
      ? "DEMO_PORTAL.PUBLIC.IMAGES_STAGE"
      : "DEMO_PORTAL.PUBLIC.SCRIPTS_STAGE";

    const tmpDir = join(process.cwd(), "tmp");
    await mkdir(tmpDir, { recursive: true });
    const tmpPath = join(tmpDir, file.name);

    const bytes = await file.arrayBuffer();
    await writeFile(tmpPath, Buffer.from(bytes));

    const destDir = destPath.substring(0, destPath.lastIndexOf("/")) || destPath;

    try {
      await uploadToStage(stageName, tmpPath, destDir);
    } finally {
      await unlink(tmpPath).catch(() => {});
    }

    return NextResponse.json({ success: true, path: `${destDir}/${file.name}` });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
