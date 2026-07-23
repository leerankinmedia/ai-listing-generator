import type { StoredMarketplaceConnection } from "@/lib/marketplaces/connections/crypto"
import {
  ebayFetch,
  ebayFetchResult,
} from "@/lib/marketplaces/adapters/ebay/client"
import { MarketplaceError } from "@/lib/marketplaces/adapters/types"
import { saveConnection } from "@/lib/marketplaces/connections/store"

const META_LOCATION_KEY = "merchantLocationKey"

/** Fixed Sandbox merchant location key — get/create by key only (no list required). */
export const SANDBOX_MERCHANT_LOCATION_KEY = "listwise-toledo"

type EbayInventoryLocation = {
  merchantLocationKey?: string
  name?: string
  merchantLocationStatus?: string
  locationTypes?: string[]
  location?: {
    address?: {
      postalCode?: string
      country?: string
      city?: string
      stateOrProvince?: string
    }
  }
}

type EbayInventoryLocationsResponse = {
  locations?: EbayInventoryLocation[]
  total?: number
}

/**
 * Valid US warehouse address with country + postalCode (required for offers).
 * Street omitted — warehouse locations only need city/state/country or postal+country.
 */
function sandboxWarehouseAddress() {
  return {
    city: process.env["EBAY_LOCATION_CITY"] || "Toledo",
    stateOrProvince: process.env["EBAY_LOCATION_STATE"] || "OH",
    postalCode: process.env["EBAY_LOCATION_POSTAL"] || "43604",
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

/**
 * Optional diagnostics only — never required for publish.
 * Failures are logged and swallowed.
 */
async function listInventoryLocationsOptional(accessToken: string) {
  try {
    const payload = (await ebayFetch(
      "/sell/inventory/v1/location?limit=100",
      accessToken,
      { method: "GET", step: "listLocationsDiagnostics" }
    )) as EbayInventoryLocationsResponse | null

    const locations = payload?.locations ?? []
    logLocationSafe("list-locations diagnostics (optional)", {
      total: payload?.total ?? locations.length,
      keys: locations
        .map((loc) => loc.merchantLocationKey)
        .filter(Boolean)
        .join(","),
      statuses: locations
        .map((loc) => loc.merchantLocationStatus || "UNKNOWN")
        .join(","),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "listLocations failed"
    logLocationSafe("list-locations diagnostics skipped", {
      ok: false,
      message: message.slice(0, 240),
    })
  }
}

/**
 * GET /location/{key} — does not log full address fields.
 */
async function getInventoryLocation(
  accessToken: string,
  merchantLocationKey: string
): Promise<EbayInventoryLocation | null> {
  try {
    const { status, data } = await ebayFetchResult(
      `/sell/inventory/v1/location/${encodeURIComponent(merchantLocationKey)}`,
      accessToken,
      { method: "GET", step: "getLocation" }
    )
    const location = (data || {}) as EbayInventoryLocation
    const returnedKey = location.merchantLocationKey || merchantLocationKey
    const address = location.location?.address
    logLocationSafe("get-location response", {
      httpStatus: status,
      requestedKey: merchantLocationKey,
      returnedKey,
      merchantLocationStatus: location.merchantLocationStatus || "UNKNOWN",
      locationTypes: (location.locationTypes || []).join(",") || undefined,
      keyMatch: returnedKey === merchantLocationKey,
      hasPostalCode: Boolean(address?.postalCode),
      hasCountry: Boolean(address?.country),
      country: address?.country || undefined,
      postalCodePresent: Boolean(address?.postalCode),
    })
    return {
      ...location,
      merchantLocationKey: returnedKey,
    }
  } catch (err) {
    if (
      err instanceof MarketplaceError &&
      (err.status === 404 || err.status === 400)
    ) {
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
    { method: "POST", body: "{}", step: "enableLocation" }
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
  const address = sandboxWarehouseAddress()
  logLocationSafe("create-location request address fields", {
    merchantLocationKey,
    hasPostalCode: Boolean(address.postalCode),
    hasCountry: Boolean(address.country),
    country: address.country,
    postalCodePresent: Boolean(address.postalCode),
    locationTypes: "WAREHOUSE",
    merchantLocationStatus: "ENABLED",
  })

  // POST returns 204 No Content on success; path key is what eBay stores.
  const { status } = await ebayFetchResult(
    `/sell/inventory/v1/location/${encodeURIComponent(merchantLocationKey)}`,
    accessToken,
    {
      method: "POST",
      step: "createLocation",
      body: JSON.stringify({
        name: "ListWise Sandbox Warehouse",
        merchantLocationStatus: "ENABLED",
        locationTypes: ["WAREHOUSE"],
        location: {
          address,
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
      `[createLocation] eBay createInventoryLocation returned HTTP ${status}; expected 204.`,
      "ebay_location_create_unexpected_status",
      502
    )
  }
}

function locationHasRequiredAddress(location: EbayInventoryLocation) {
  const address = location.location?.address
  return Boolean(address?.postalCode && address?.country)
}

/**
 * Confirm key via GET: same key, ENABLED, postalCode + country present.
 */
async function verifyEnabledLocationKey(
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
    if (
      !location?.merchantLocationKey ||
      !isEnabledStatus(location.merchantLocationStatus)
    ) {
      return null
    }
  }

  if (!locationHasRequiredAddress(location)) {
    logLocationSafe("location missing postalCode or country", {
      merchantLocationKey: candidateKey,
      merchantLocationStatus: location.merchantLocationStatus || "UNKNOWN",
      hasPostalCode: Boolean(location.location?.address?.postalCode),
      hasCountry: Boolean(location.location?.address?.country),
    })
    return null
  }

  logLocationSafe("verified ENABLED location for offer", {
    merchantLocationKey: candidateKey,
    merchantLocationStatus: location.merchantLocationStatus || "ENABLED",
    hasPostalCode: true,
    hasCountry: true,
    country: location.location?.address?.country,
  })

  return location.merchantLocationKey
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
 * Ensure Sandbox inventory location without calling getInventoryLocations.
 *
 * Flow:
 * 1) getInventoryLocation(listwise-toledo) [or env override key]
 * 2) if missing → createInventoryLocation with that exact key
 * 3) getInventoryLocation again and require ENABLED + postalCode + country
 * 4) optional listLocations diagnostics only (never required)
 */
export async function ensureEbayMerchantLocationKey(
  accessToken: string,
  connection: StoredMarketplaceConnection
): Promise<{ merchantLocationKey: string; connection: StoredMarketplaceConnection }> {
  const merchantLocationKey =
    process.env["EBAY_MERCHANT_LOCATION_KEY"]?.trim() ||
    SANDBOX_MERCHANT_LOCATION_KEY

  logLocationSafe("ensure location via get/create (no list required)", {
    merchantLocationKey,
  })

  let verified = await verifyEnabledLocationKey(accessToken, merchantLocationKey)

  if (!verified) {
    logLocationSafe("fixed key not found or not usable; creating", {
      merchantLocationKey,
    })
    try {
      await createInventoryLocation(accessToken, merchantLocationKey)
    } catch (err) {
      // Location may already exist (race / prior create) — verify again.
      verified = await verifyEnabledLocationKey(accessToken, merchantLocationKey)
      if (verified) {
        const next = await persistLocationKey(connection, verified)
        void listInventoryLocationsOptional(accessToken)
        return { merchantLocationKey: verified, connection: next }
      }
      throw err instanceof MarketplaceError
        ? err
        : new MarketplaceError(
            `[createLocation] Failed to create eBay inventory location ${merchantLocationKey}.`,
            "ebay_location_create_failed",
            502
          )
    }

    verified = await verifyEnabledLocationKey(accessToken, merchantLocationKey)
  }

  if (!verified) {
    throw new MarketplaceError(
      `[getLocation] Inventory location ${merchantLocationKey} was not ENABLED with postalCode+country after create.`,
      "ebay_location_missing",
      502
    )
  }

  const next = await persistLocationKey(connection, verified)

  // Optional diagnostics only — must not block publish.
  void listInventoryLocationsOptional(accessToken)

  return { merchantLocationKey: verified, connection: next }
}
