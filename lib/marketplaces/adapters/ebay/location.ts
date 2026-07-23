import { randomBytes } from "crypto"
import type { StoredMarketplaceConnection } from "@/lib/marketplaces/connections/crypto"
import {
  ebayFetch,
  ebayFetchResult,
} from "@/lib/marketplaces/adapters/ebay/client"
import { MarketplaceError } from "@/lib/marketplaces/adapters/types"
import { saveConnection } from "@/lib/marketplaces/connections/store"

const META_LOCATION_KEY = "merchantLocationKey"

type EbayInventoryLocation = {
  merchantLocationKey?: string
  name?: string
  merchantLocationStatus?: string
  locationTypes?: string[]
}

type EbayInventoryLocationsResponse = {
  locations?: EbayInventoryLocation[]
  total?: number
}

/**
 * Warehouse locations only require city + state/province + country
 * (or postalCode + country). Omit street to avoid Sandbox address
 * validation rejecting a fabricated full street address.
 */
function sandboxWarehouseAddress() {
  return {
    city: process.env["EBAY_LOCATION_CITY"] || "San Jose",
    stateOrProvince: process.env["EBAY_LOCATION_STATE"] || "CA",
    postalCode: process.env["EBAY_LOCATION_POSTAL"] || "95125",
    country: process.env["EBAY_LOCATION_COUNTRY"] || "US",
  }
}

function isEnabledStatus(status?: string) {
  return !status || status === "ENABLED"
}

function logLocationSafe(
  event: string,
  details: Record<string, string | number | boolean | undefined | null>
) {
  console.info(`[ebay/location] TEMP ${event}`, details)
}

async function listInventoryLocations(accessToken: string) {
  const payload = (await ebayFetch(
    "/sell/inventory/v1/location?limit=100",
    accessToken,
    { method: "GET" }
  )) as EbayInventoryLocationsResponse | null

  const locations = payload?.locations ?? []
  logLocationSafe("list-locations", {
    total: payload?.total ?? locations.length,
    keys: locations
      .map((loc) => loc.merchantLocationKey)
      .filter(Boolean)
      .join(","),
    statuses: locations
      .map((loc) => loc.merchantLocationStatus || "UNKNOWN")
      .join(","),
  })
  return locations
}

/**
 * GET /location/{key} — confirms the key exists on eBay and returns status.
 * Does not log address fields.
 */
async function getInventoryLocation(
  accessToken: string,
  merchantLocationKey: string
): Promise<EbayInventoryLocation | null> {
  try {
    const { status, data } = await ebayFetchResult(
      `/sell/inventory/v1/location/${encodeURIComponent(merchantLocationKey)}`,
      accessToken,
      { method: "GET" }
    )
    const location = (data || {}) as EbayInventoryLocation
    const returnedKey = location.merchantLocationKey || merchantLocationKey
    logLocationSafe("get-location response", {
      httpStatus: status,
      requestedKey: merchantLocationKey,
      returnedKey,
      merchantLocationStatus: location.merchantLocationStatus || "UNKNOWN",
      locationTypes: (location.locationTypes || []).join(",") || undefined,
      keyMatch: returnedKey === merchantLocationKey,
    })
    return {
      ...location,
      merchantLocationKey: returnedKey,
    }
  } catch (err) {
    if (err instanceof MarketplaceError && (err.status === 404 || err.status === 400)) {
      logLocationSafe("get-location missing", {
        requestedKey: merchantLocationKey,
        httpStatus: err.status,
      })
      return null
    }
    throw err
  }
}

async function enableInventoryLocation(
  accessToken: string,
  merchantLocationKey: string
) {
  const { status } = await ebayFetchResult(
    `/sell/inventory/v1/location/${encodeURIComponent(merchantLocationKey)}/enable`,
    accessToken,
    { method: "POST", body: "{}" }
  )
  logLocationSafe("enable-location response", {
    httpStatus: status,
    merchantLocationKey,
  })
}

async function createInventoryLocation(
  accessToken: string,
  merchantLocationKey: string
) {
  // POST returns 204 No Content on success; the path key is what eBay stores.
  const { status } = await ebayFetchResult(
    `/sell/inventory/v1/location/${encodeURIComponent(merchantLocationKey)}`,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify({
        name: "ListWise Sandbox Warehouse",
        locationTypes: ["WAREHOUSE"],
        // Omit merchantLocationStatus — eBay defaults new locations to ENABLED.
        location: {
          address: sandboxWarehouseAddress(),
        },
      }),
    }
  )

  logLocationSafe("create-location response", {
    httpStatus: status,
    merchantLocationKey,
    expectedStatus: 204,
    createSucceeded: status === 204,
  })

  if (status !== 204) {
    throw new MarketplaceError(
      `eBay createInventoryLocation returned HTTP ${status}; expected 204.`,
      "ebay_location_create_unexpected_status",
      502
    )
  }
}

/**
 * Verify a candidate key via GET. Enable if disabled. Returns the key eBay
 * returned (must match) only when ENABLED.
 */
async function resolveEnabledLocationKey(
  accessToken: string,
  candidateKey: string
): Promise<string | null> {
  let location = await getInventoryLocation(accessToken, candidateKey)
  if (!location?.merchantLocationKey) return null

  if (location.merchantLocationKey !== candidateKey) {
    logLocationSafe("get-location key mismatch", {
      requestedKey: candidateKey,
      returnedKey: location.merchantLocationKey,
    })
    return null
  }

  if (!isEnabledStatus(location.merchantLocationStatus)) {
    await enableInventoryLocation(accessToken, candidateKey)
    location = await getInventoryLocation(accessToken, candidateKey)
    if (!location?.merchantLocationKey || !isEnabledStatus(location.merchantLocationStatus)) {
      return null
    }
  }

  return location.merchantLocationKey
}

function pickEnabledLocationKey(locations: EbayInventoryLocation[]) {
  const enabled = locations.find(
    (loc) => loc.merchantLocationKey && isEnabledStatus(loc.merchantLocationStatus)
  )
  return enabled?.merchantLocationKey
}

async function clearStoredLocationKey(connection: StoredMarketplaceConnection) {
  if (!connection.meta?.[META_LOCATION_KEY]) return connection
  const nextMeta = { ...connection.meta }
  delete nextMeta[META_LOCATION_KEY]
  const next: StoredMarketplaceConnection = {
    ...connection,
    meta: nextMeta,
    updatedAt: new Date().toISOString(),
  }
  await saveConnection(next)
  return next
}

async function persistLocationKey(
  connection: StoredMarketplaceConnection,
  merchantLocationKey: string
) {
  const next: StoredMarketplaceConnection = {
    ...connection,
    meta: {
      ...connection.meta,
      [META_LOCATION_KEY]: merchantLocationKey,
    },
    updatedAt: new Date().toISOString(),
  }
  await saveConnection(next)
  logLocationSafe("saved merchantLocationKey", {
    merchantLocationKey,
    source: "verified-via-get-location",
  })
  return next
}

/**
 * Ensure the connected eBay seller has an ENABLED inventory location.
 *
 * Never returns a key that was not confirmed via GET /location/{key} with
 * merchantLocationStatus=ENABLED. Never invents a key without create+GET.
 */
export async function ensureEbayMerchantLocationKey(
  accessToken: string,
  connection: StoredMarketplaceConnection
): Promise<{ merchantLocationKey: string; connection: StoredMarketplaceConnection }> {
  let current = connection

  const stored = current.meta?.[META_LOCATION_KEY]?.trim()
  if (stored) {
    const verified = await resolveEnabledLocationKey(accessToken, stored)
    if (verified) {
      logLocationSafe("using stored verified key", { merchantLocationKey: verified })
      return { merchantLocationKey: verified, connection: current }
    }
    logLocationSafe("stored key invalid; clearing", { merchantLocationKey: stored })
    current = await clearStoredLocationKey(current)
  }

  const envKey = process.env["EBAY_MERCHANT_LOCATION_KEY"]?.trim()
  if (envKey) {
    const verified = await resolveEnabledLocationKey(accessToken, envKey)
    if (verified) {
      const next = await persistLocationKey(current, verified)
      return { merchantLocationKey: verified, connection: next }
    }
    logLocationSafe("env key not found or not enabled on eBay", {
      merchantLocationKey: envKey,
    })
  }

  const existing = await listInventoryLocations(accessToken)
  const existingKey = pickEnabledLocationKey(existing)
  if (existingKey) {
    const verified = await resolveEnabledLocationKey(accessToken, existingKey)
    if (verified) {
      const next = await persistLocationKey(current, verified)
      return { merchantLocationKey: verified, connection: next }
    }
  }

  // Disabled-but-present: try enabling the first listed key.
  for (const loc of existing) {
    if (!loc.merchantLocationKey) continue
    const verified = await resolveEnabledLocationKey(accessToken, loc.merchantLocationKey)
    if (verified) {
      const next = await persistLocationKey(current, verified)
      return { merchantLocationKey: verified, connection: next }
    }
  }

  // Alphanumeric-only key (max 36). Underscores avoided for Sandbox quirks.
  const merchantLocationKey = `lw${randomBytes(8).toString("hex")}` // lw + 16 hex = 18 chars
  try {
    await createInventoryLocation(accessToken, merchantLocationKey)
  } catch (err) {
    const after = await listInventoryLocations(accessToken)
    for (const loc of after) {
      if (!loc.merchantLocationKey) continue
      const recovered = await resolveEnabledLocationKey(
        accessToken,
        loc.merchantLocationKey
      )
      if (recovered) {
        const next = await persistLocationKey(current, recovered)
        return { merchantLocationKey: recovered, connection: next }
      }
    }
    throw err instanceof MarketplaceError
      ? err
      : new MarketplaceError(
          "Failed to create eBay inventory location.",
          "ebay_location_create_failed",
          502
        )
  }

  const confirmedKey = await resolveEnabledLocationKey(
    accessToken,
    merchantLocationKey
  )
  if (!confirmedKey) {
    throw new MarketplaceError(
      "eBay inventory location was created but GET did not return an ENABLED location with that key.",
      "ebay_location_missing",
      502
    )
  }

  const next = await persistLocationKey(current, confirmedKey)
  return { merchantLocationKey: confirmedKey, connection: next }
}
