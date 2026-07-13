import type { Listing, ListingImage, MarketplaceId } from "@/lib/types"
import { MARKETPLACE_IDS } from "@/lib/marketplaces"

const DB_NAME = "listwise"
const STORE = "listings"
const DB_VERSION = 1

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) {
        const objectStore = db.createObjectStore(STORE, { keyPath: "id" })
        objectStore.createIndex("userId", "userId", { unique: false })
        objectStore.createIndex("updatedAt", "updatedAt", { unique: false })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

export async function listLocalListings(userId: string): Promise<Listing[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly")
    const store = tx.objectStore(STORE)
    const index = store.index("userId")
    const request = index.getAll(userId)
    request.onsuccess = () => {
      const rows = (request.result as Listing[]).sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt)
      )
      resolve(rows)
    }
    request.onerror = () => reject(request.error)
  })
}

export async function getLocalListing(id: string): Promise<Listing | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly")
    const request = tx.objectStore(STORE).get(id)
    request.onsuccess = () => resolve((request.result as Listing) ?? null)
    request.onerror = () => reject(request.error)
  })
}

export async function saveLocalListing(listing: Listing): Promise<Listing> {
  const db = await openDb()
  const tx = db.transaction(STORE, "readwrite")
  tx.objectStore(STORE).put(listing)
  await txDone(tx)
  return listing
}

export async function deleteLocalListing(id: string): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(STORE, "readwrite")
  tx.objectStore(STORE).delete(id)
  await txDone(tx)
}

export function createListingId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `lst_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

export function createEmptyListing(userId: string): Listing {
  const now = new Date().toISOString()
  return {
    id: createListingId(),
    userId,
    title: "",
    description: "",
    price: 0,
    currency: "USD",
    keywords: [],
    specifics: {},
    images: [],
    status: "draft",
    marketplaceListings: [],
    targetMarketplaces: [...MARKETPLACE_IDS] as MarketplaceId[],
    aiGenerated: false,
    createdAt: now,
    updatedAt: now,
  }
}

export function withImages(
  listing: Listing,
  images: ListingImage[],
  patch: Partial<Listing> = {}
): Listing {
  return {
    ...listing,
    ...patch,
    images,
    updatedAt: new Date().toISOString(),
  }
}
