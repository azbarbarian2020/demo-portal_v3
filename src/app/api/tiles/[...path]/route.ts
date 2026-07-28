import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const pathSegments = (await params).path;
  const tilePath = pathSegments.join("/");
  const tileUrl = `https://tile.openstreetmap.org/${tilePath}`;

  try {
    const response = await fetch(tileUrl, {
      headers: {
        "User-Agent": "DemoPortal/1.0",
      },
    });

    if (!response.ok) {
      return new NextResponse(null, { status: response.status });
    }

    const body = await response.arrayBuffer();
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": response.headers.get("content-type") || "image/png",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
