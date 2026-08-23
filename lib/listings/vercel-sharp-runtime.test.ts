import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"
import { MarketplaceError } from "@/lib/marketplaces/adapters/types"
import { sharpBakeError } from "@/lib/listings/marketplace-image-normalize"

describe("Vercel / Next.js Sharp runtime for eBay bake", () => {
  it("keeps sharp external and traces linux-x64 libvips into the publish function", () => {
    const config = readFileSync("next.config.mjs", "utf8")
    assert.match(config, /serverExternalPackages:\s*\[["']sharp["']\]/)
    assert.match(config, /outputFileTracingIncludes/)
    assert.match(config, /@img\+sharp-libvips-linux-x64@\*/)
    assert.equal(
      /@img\+sharp-linux-x64@\*/.test(config),
      false,
      "do not glob the pnpm symlink under sharp-linux-x64; Vercel rejects that package"
    )
  })

  it("runs publish and version on the Node.js runtime, not Edge", () => {
    for (const path of [
      "app/api/listings/publish/route.ts",
      "app/api/version/route.ts",
    ]) {
      const src = readFileSync(path, "utf8")
      assert.match(src, /export const runtime = ["']nodejs["']/, path)
      assert.equal(src.includes('runtime = "edge"'), false, path)
    }
  })

  it("does not fall back to the original EXIF file when Sharp fails", () => {
    const src = readFileSync("lib/listings/marketplace-image-normalize.ts", "utf8")
    assert.equal(/return fallback/.test(src), false)
    assert.match(src, /throw sharpBakeError/)
  })

  it("does not put Sharp's dependency dump on the bake error", () => {
    const error = sharpBakeError(
      new Error(`Could not load the "sharp" module using the linux-x64 runtime
Possible solutions:
- npm install --os=linux --cpu=x64 sharp
ERR_DLOPEN_FAILED: libvips-cpp.so.8.18.3: cannot open shared object file`)
    )
    assert.ok(error instanceof MarketplaceError)
    assert.equal(error.code, "ebay_image_normalize_unavailable")
    assert.equal(error.message.includes("Possible solutions:"), false)
    assert.equal(error.message.includes("npm install --os="), false)
    assert.match(error.message, /photos were not sent/i)
  })
})
