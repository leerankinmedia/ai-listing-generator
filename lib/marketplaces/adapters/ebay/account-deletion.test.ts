import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { describe, it } from "node:test"
import {
  buildEbayDeletionChallengeResponse,
  parseEbayDeletionNotification,
} from "@/lib/marketplaces/adapters/ebay/account-deletion"

describe("ebay account deletion challenge", () => {
  it("hashes challengeCode + verificationToken + endpointURL in order", () => {
    const challengeCode = "abc123"
    const verificationToken = "token-01234567890123456789012345678901"
    const endpointUrl =
      "https://ai-listing-generator-n2ji.vercel.app/api/ebay/account-deletion"
    const expected = createHash("sha256")
      .update(challengeCode + verificationToken + endpointUrl, "utf8")
      .digest("hex")
    assert.equal(
      buildEbayDeletionChallengeResponse(
        challengeCode,
        verificationToken,
        endpointUrl
      ),
      expected
    )
  })

  it("parses notification identity without requiring PII logs", () => {
    const parsed = parseEbayDeletionNotification({
      metadata: { topic: "MARKETPLACE_ACCOUNT_DELETION" },
      notification: {
        notificationId: "n-1",
        data: { username: "seller1", userId: "u-99", eiasToken: "eias" },
      },
    })
    assert.equal(parsed.username, "seller1")
    assert.equal(parsed.userId, "u-99")
    assert.equal(parsed.notificationId, "n-1")
    assert.equal(parsed.topic, "MARKETPLACE_ACCOUNT_DELETION")
  })
})
