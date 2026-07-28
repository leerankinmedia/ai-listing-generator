import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { isAllowedAnalyzeImageUrl } from "@/lib/listings/analyze-url"

describe("isAllowedAnalyzeImageUrl", () => {
  it("rejects arbitrary hosts", () => {
    assert.equal(
      isAllowedAnalyzeImageUrl("https://evil.example/image.jpg"),
      false
    )
    assert.equal(isAllowedAnalyzeImageUrl("data:image/jpeg;base64,aaa"), false)
  })

  it("accepts supabase public storage paths when configured", () => {
    const previous = process.env.NEXT_PUBLIC_SUPABASE_URL
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abc.supabase.co"
    try {
      assert.equal(
        isAllowedAnalyzeImageUrl(
          "https://abc.supabase.co/storage/v1/object/public/listing-images/analyze/u/1.jpg"
        ),
        true
      )
      assert.equal(
        isAllowedAnalyzeImageUrl(
          "https://abc.supabase.co/storage/v1/object/sign/listing-images/x"
        ),
        false
      )
    } finally {
      if (previous === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
      else process.env.NEXT_PUBLIC_SUPABASE_URL = previous
    }
  })
})
