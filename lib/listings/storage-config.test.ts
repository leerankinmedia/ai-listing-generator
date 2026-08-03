import assert from "node:assert/strict"
import { describe, it, beforeEach, afterEach } from "node:test"
import {
  diagnoseBrowserStorageConfig,
  diagnoseSupabaseStorageConfig,
  listingImagesBucketName,
} from "@/lib/listings/storage-config"

describe("storage-config", () => {
  const keys = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_STORAGE_BUCKET",
    "NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET",
  ] as const
  const saved: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const key of keys) {
      saved[key] = process.env[key]
      delete process.env[key]
    }
  })

  afterEach(() => {
    for (const key of keys) {
      const value = saved[key]
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  it("reports missing service role for server diagnosis", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abc.supabase.co"
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "pk_test_long_enough_value"
    const d = diagnoseSupabaseStorageConfig({ requireServiceRole: true })
    assert.equal(d.ok, false)
    assert.ok(d.missing.includes("SUPABASE_SERVICE_ROLE_KEY"))
    assert.ok(d.reason?.includes("SUPABASE_SERVICE_ROLE_KEY"))
  })

  it("browser diagnosis does not require service role", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abc.supabase.co"
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "pk_test_long_enough_value"
    const d = diagnoseBrowserStorageConfig()
    assert.equal(d.ok, true)
    assert.equal(d.hasServiceRoleKey, false)
    assert.equal(d.urlHost, "abc.supabase.co")
  })

  it("defaults bucket to listing-images", () => {
    assert.equal(listingImagesBucketName(), "listing-images")
  })

  it("prefers NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET", () => {
    process.env.SUPABASE_STORAGE_BUCKET = "server-bucket"
    process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET = "client-bucket"
    assert.equal(listingImagesBucketName(), "client-bucket")
  })
})
