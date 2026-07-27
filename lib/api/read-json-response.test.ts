import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  formatNonJsonApiError,
  readApiJsonResponse,
} from "@/lib/api/read-json-response"

describe("readApiJsonResponse", () => {
  it("parses JSON success bodies", async () => {
    const response = new Response(JSON.stringify({ draft: { title: "Tee" } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
    const result = await readApiJsonResponse<{ draft: { title: string } }>(
      response
    )
    assert.equal(result.ok, true)
    if (result.ok) {
      assert.equal(result.data.draft.title, "Tee")
    }
  })

  it("surfaces plain-text platform errors without crashing", async () => {
    const response = new Response("Request Entity Too Large", {
      status: 413,
      headers: { "content-type": "text/plain" },
    })
    const result = await readApiJsonResponse(response)
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.match(result.error, /HTTP 413/)
      assert.match(result.error, /Request Entity Too Large/)
      assert.equal(result.data, null)
    }
  })

  it("formats non-JSON snippets for UI display", () => {
    assert.match(
      formatNonJsonApiError(413, "Request Entity Too Large"),
      /HTTP 413: Request Entity Too Large/
    )
  })
})
