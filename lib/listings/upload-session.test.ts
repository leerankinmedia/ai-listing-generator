import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  allListingImagesUploaded,
  durableImagesForSession,
  listingImagesStillUploading,
} from "@/lib/listings/upload-session"
import type { ListingImage } from "@/lib/types"

function img(
  partial: Partial<ListingImage> & Pick<ListingImage, "id" | "url">
): ListingImage {
  return {
    sortOrder: 0,
    ...partial,
  }
}

describe("upload-session helpers", () => {
  it("requires storageStatus uploaded and durable https URLs", () => {
    assert.equal(allListingImagesUploaded([]), false)
    assert.equal(
      allListingImagesUploaded([
        img({
          id: "1",
          url: "blob:http://localhost/x",
          storageStatus: "pending",
        }),
      ]),
      false
    )
    assert.equal(
      allListingImagesUploaded([
        img({
          id: "1",
          url: "https://abc.supabase.co/storage/v1/object/public/listing-images/u/a.jpg",
          storageStatus: "uploading",
        }),
      ]),
      false
    )
    assert.equal(
      allListingImagesUploaded([
        img({
          id: "1",
          url: "https://abc.supabase.co/storage/v1/object/public/listing-images/u/a.jpg",
          storageStatus: "uploaded",
        }),
      ]),
      true
    )
    assert.equal(
      allListingImagesUploaded([
        img({
          id: "1",
          url: "https://app.example/api/media/staging/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          storageStatus: "uploaded",
        }),
      ]),
      false
    )
  })

  it("detects in-flight uploads", () => {
    assert.equal(
      listingImagesStillUploading([
        img({
          id: "1",
          url: "blob:x",
          storageStatus: "uploading",
        }),
      ]),
      true
    )
    assert.equal(
      listingImagesStillUploading([
        img({
          id: "1",
          url: "https://abc.supabase.co/storage/v1/object/public/listing-images/u/a.jpg",
          storageStatus: "uploaded",
        }),
      ]),
      false
    )
  })

  it("filters session draft to durable images only", () => {
    const durable = durableImagesForSession([
      img({
        id: "keep",
        url: "https://abc.supabase.co/storage/v1/object/public/listing-images/u/a.jpg",
        storageStatus: "uploaded",
        sortOrder: 2,
      }),
      img({
        id: "drop-blob",
        url: "blob:http://localhost/x",
        storageStatus: "pending",
      }),
      img({
        id: "drop-staging",
        url: "https://app.example/api/media/staging/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        storageStatus: "uploaded",
      }),
    ])
    assert.equal(durable.length, 1)
    assert.equal(durable[0].id, "keep")
    assert.equal(durable[0].sortOrder, 0)
    assert.equal(durable[0].isPrimary, true)
    assert.equal(durable[0].storageStatus, "uploaded")
  })
})
