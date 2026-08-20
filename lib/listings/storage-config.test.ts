import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { diagnoseSupabaseStorageConfig } from "@/lib/listings/storage-config"

describe("diagnoseSupabaseStorageConfig", () => {
  it("requires URL, publishable key, and service role by default", () => {
    const previous = {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL,
      pub: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      svc: process.env.SUPABASE_SERVICE_ROLE_KEY,
    }
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    try {
      const report = diagnoseSupabaseStorageConfig()
      assert.equal(report.ok, false)
      assert.ok(report.missing.includes("NEXT_PUBLIC_SUPABASE_URL"))
      assert.ok(report.missing.includes("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"))
      assert.ok(report.missing.includes("SUPABASE_SERVICE_ROLE_KEY"))
    } finally {
      if (previous.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
      else process.env.NEXT_PUBLIC_SUPABASE_URL = previous.url
      if (previous.pub === undefined) {
        delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
      } else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = previous.pub
      if (previous.svc === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY
      else process.env.SUPABASE_SERVICE_ROLE_KEY = previous.svc
    }
  })

  it("is ok when all storage env vars are present", () => {
    const previous = {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL,
      pub: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      svc: process.env.SUPABASE_SERVICE_ROLE_KEY,
    }
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abcd.supabase.co"
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test_key"
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key-value-for-tests"
    try {
      const report = diagnoseSupabaseStorageConfig()
      assert.equal(report.ok, true)
      assert.equal(report.urlHost, "abcd.supabase.co")
      assert.equal(report.bucket, "listing-images")
      assert.deepEqual(report.missing, [])
    } finally {
      if (previous.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
      else process.env.NEXT_PUBLIC_SUPABASE_URL = previous.url
      if (previous.pub === undefined) {
        delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
      } else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = previous.pub
      if (previous.svc === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY
      else process.env.SUPABASE_SERVICE_ROLE_KEY = previous.svc
    }
  })
})
