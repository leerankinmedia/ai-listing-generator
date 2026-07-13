import { generateObject } from "ai"
import { createOpenAI } from "@ai-sdk/openai"
import type { ListingInput, ListingResult } from "@/types/listing"
import { listingInputSchema } from "@/types/listing"
import { aiListingOutputSchema } from "@/lib/ai/listing-schema"
import { buildListingSystemPrompt, buildListingUserPrompt } from "@/lib/ai/listing-prompt"
import { generateDemoListing } from "@/lib/ai/demo-listing"
import { postProcessListing } from "@/lib/ai/post-process"

export type GenerateListingMeta = {
  mode: "live" | "demo"
  model?: string
}

export async function generateListing(
  rawInput: unknown,
): Promise<{ result: ListingResult; meta: GenerateListingMeta }> {
  const input = listingInputSchema.parse(rawInput)
  const apiKey = process.env.OPENAI_API_KEY

  if (!apiKey) {
    return { result: generateDemoListing(input), meta: { mode: "demo" } }
  }

  const modelName = process.env.OPENAI_MODEL || "gpt-4o"
  const openai = createOpenAI({ apiKey })

  const userText = buildListingUserPrompt(input)
  const images = (input.imageDataUrls ?? []).slice(0, 4)

  const content: Array<
    | { type: "text"; text: string }
    | { type: "image"; image: string }
  > = [{ type: "text", text: userText }]

  for (const dataUrl of images) {
    content.push({ type: "image", image: dataUrl })
  }

  const { object } = await generateObject({
    model: openai(modelName),
    schema: aiListingOutputSchema,
    system: buildListingSystemPrompt(),
    messages: [
      {
        role: "user",
        content,
      },
    ],
    temperature: 0.4,
  })

  return {
    result: postProcessListing(object, input),
    meta: { mode: "live", model: modelName },
  }
}
