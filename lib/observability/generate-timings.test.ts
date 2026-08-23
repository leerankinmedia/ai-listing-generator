import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  GENERATE_STAGES,
  mergeGenerateStages,
} from "@/lib/observability/generate-timings"

describe("generate timings", () => {
  it("includes every reported generate stage", () => {
    assert.ok(GENERATE_STAGES.includes("photo_analysis_preparation"))
    assert.ok(GENERATE_STAGES.includes("analysis_image_upload"))
    assert.ok(GENERATE_STAGES.includes("openai_request"))
    assert.ok(GENERATE_STAGES.includes("openai_parse"))
    assert.ok(GENERATE_STAGES.includes("ebay_category_lookup"))
    assert.ok(GENERATE_STAGES.includes("ebay_condition_lookup"))
    assert.ok(GENERATE_STAGES.includes("ebay_item_specifics_lookup"))
    assert.ok(GENERATE_STAGES.includes("draft_mapping"))
    assert.ok(GENERATE_STAGES.includes("database_save"))
    assert.ok(GENERATE_STAGES.includes("redirect_to_review"))
    assert.ok(GENERATE_STAGES.includes("total"))
  })

  it("adds overlapping stage milliseconds", () => {
    const merged = mergeGenerateStages(
      { openai_request: 12000, openai_parse: 2 },
      { openai_request: 4000, ebay_category_lookup: 350 }
    )
    assert.equal(merged.openai_request, 16000)
    assert.equal(merged.openai_parse, 2)
    assert.equal(merged.ebay_category_lookup, 350)
  })
})
