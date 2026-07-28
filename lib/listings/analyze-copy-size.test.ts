import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  ANALYZE_COPY_TARGET_MAX_BYTES,
  ANALYZE_UPLOAD_MAX_BYTES,
} from "@/lib/listings/schema"

describe("analyze copy sizing contracts", () => {
  it("keeps analysis uploads under the Vercel single-request budget", () => {
    assert.ok(ANALYZE_COPY_TARGET_MAX_BYTES <= ANALYZE_UPLOAD_MAX_BYTES)
    assert.equal(ANALYZE_COPY_TARGET_MAX_BYTES, 1024 * 1024)
    assert.ok(ANALYZE_UPLOAD_MAX_BYTES <= 4.5 * 1024 * 1024)
  })
})
