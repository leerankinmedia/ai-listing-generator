import { NextResponse } from "next/server"
import { ZodError } from "zod"
import { generateListing } from "@/lib/ai/generate-listing"

export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { result, meta } = await generateListing(body)

    return NextResponse.json({
      data: result,
      meta: {
        ...meta,
        generatedAt: new Date().toISOString(),
      },
    })
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid listing input",
            details: error.flatten(),
          },
        },
        { status: 400 },
      )
    }

    console.error("[generate-listing]", error)
    return NextResponse.json(
      {
        error: {
          code: "GENERATION_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "Failed to generate listing. Please try again.",
        },
      },
      { status: 500 },
    )
  }
}
