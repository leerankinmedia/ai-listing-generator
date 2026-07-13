import { NextResponse } from "next/server"
import { isOpenAIConfigured } from "@/lib/ai/generate-listing"

export const runtime = "nodejs"

/**
 * Safe status check — never returns the API key value.
 * Use this after pasting OPENAI_API_KEY into .env.local and restarting the server.
 */
export async function GET() {
  const raw = process.env.OPENAI_API_KEY ?? ""
  const configured = isOpenAIConfigured()

  return NextResponse.json({
    configured,
    source: "process.env.OPENAI_API_KEY",
    present: Boolean(raw),
    looksLikeKey: raw.startsWith("sk-"),
    length: raw.length,
    // Helpful without leaking secrets
    hint: configured
      ? "OpenAI key is loaded. Vision listing engine is ready."
      : "Key not loaded. Paste it into /workspace/.env.local as OPENAI_API_KEY=sk-... then restart `pnpm dev`.",
  })
}
