import { NextResponse } from "next/server";
import { generatePresignedUrl } from "@/lib/snowflake";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get("path");

  if (!path) {
    return NextResponse.json({ error: "Missing path" }, { status: 400 });
  }

  try {
    const presignedUrl = await generatePresignedUrl(path, "DEMO_PORTAL.PUBLIC.IMAGES_STAGE");
    if (!presignedUrl) {
      return new NextResponse("Not found", { status: 404 });
    }

    const response = await fetch(presignedUrl);
    if (!response.ok) {
      return new NextResponse("Failed to fetch image", { status: 502 });
    }

    const contentType = response.headers.get("content-type") || "image/png";
    const buffer = await response.arrayBuffer();

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
