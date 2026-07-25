import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  DEFAULT_EBAY_CONDITION_DETAILS,
  appendConditionNotesSection,
  ebayConditionDescription,
  sanitizeDetectedFlaws,
} from "@/lib/listings/condition-details"

describe("condition details / flaws", () => {
  it("coerces low-confidence invented wear to None visible", () => {
    assert.equal(
      sanitizeDetectedFlaws("Wrinkled fabric, slight fading on print.", 0.55),
      "None visible"
    )
  })

  it("keeps high-confidence verified flaws", () => {
    assert.equal(
      sanitizeDetectedFlaws("Small stain near hem", 0.92),
      "Small stain near hem"
    )
  })

  it("uses neutral eBay condition details when no verified flaws", () => {
    assert.equal(
      ebayConditionDescription("Wrinkled fabric, slight fading on print.", 0.4),
      DEFAULT_EBAY_CONDITION_DETAILS
    )
    assert.equal(
      ebayConditionDescription("None visible", 0.99),
      DEFAULT_EBAY_CONDITION_DETAILS
    )
  })

  it("appends Condition notes only for verified flaws", () => {
    const withNotes = appendConditionNotesSection(
      "Nice graphic tee.",
      "Hole near collar",
      0.9
    )
    assert.match(withNotes, /Condition notes/)
    assert.match(withNotes, /Hole near collar/)

    const without = appendConditionNotesSection(
      "Nice graphic tee.",
      "Wrinkled fabric",
      0.5
    )
    assert.equal(without, "Nice graphic tee.")
  })
})
