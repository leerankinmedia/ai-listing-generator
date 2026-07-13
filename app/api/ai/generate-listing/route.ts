import {
  handleGenerateListingGET,
  handleGenerateListingPOST,
} from "@/lib/ai/listing-api"

export const runtime = "nodejs"
export const maxDuration = 60

/** Canonical Phase 1+ alias under /api/ai/* */
export async function POST(req: Request) {
  return handleGenerateListingPOST(req)
}

export async function GET() {
  return handleGenerateListingGET()
}
