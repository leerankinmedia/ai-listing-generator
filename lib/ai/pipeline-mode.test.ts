import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  modelsForPipeline,
  resolvePipelineMode,
} from "@/lib/ai/pipeline-mode"

describe("pipeline-mode", () => {
  it("defaults non-owners to hybrid", () => {
    assert.equal(
      resolvePipelineMode("mini", { isOwner: false }),
      "hybrid"
    )
  })

  it("allows founders to select mini / strong / hybrid", () => {
    assert.equal(resolvePipelineMode("mini", { isOwner: true }), "mini")
    assert.equal(resolvePipelineMode("strong", { isOwner: true }), "strong")
    assert.equal(resolvePipelineMode("hybrid", { isOwner: true }), "hybrid")
  })

  it("resolves hybrid models to strong identity + mini copy", () => {
    const models = modelsForPipeline("hybrid")
    assert.equal(models.identityModel, "gpt-4o")
    assert.equal(models.copyModel, "gpt-4.1-mini")
  })

  it("uses the same model for mini and strong modes", () => {
    assert.equal(modelsForPipeline("mini").identityModel, "gpt-4.1-mini")
    assert.equal(modelsForPipeline("mini").copyModel, "gpt-4.1-mini")
    assert.equal(modelsForPipeline("strong").identityModel, "gpt-4o")
    assert.equal(modelsForPipeline("strong").copyModel, "gpt-4o")
  })
})
