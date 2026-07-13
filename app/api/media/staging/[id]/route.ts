import { NextResponse } from "next/server"
import { getStagingImage } from "@/lib/marketplaces/images/staging-store"

export const runtime = "nodejs"

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  if (!/^[a-f0-9]{32}$/.test(id)) {
    return NextResponse.json({ error: "Invalid media id." }, { status: 400 })
  }
  const image = getStagingImage(id)
  if (!image) {
    return NextResponse.json(
      { error: "Staged image not found or expired." },
      { status: 404 }
    )
  }
  return new NextResponse(new Uint8Array(image.buffer), {
    status: 200,
    headers: {
      "Content-Type": image.contentType,
      "Cache-Control": "private, max-age=600",
    },
  })
}
