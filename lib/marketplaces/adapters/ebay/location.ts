import { randomBytes } from "crypto"
import type { StoredMarketplaceConnection } from "@/lib/marketplaces/connections/crypto"
import { ebayFetch } from "@/lib/marketplaces/adapters/ebay/client"
import { MarketplaceError } from "@/lib/marketplaces/adapters/types"
import { saveConnection } from "@/lib/marketplaces/connections/store"

const META_LOCATION_KEY = "merchantLocationKey"

type EbayInventoryLocation = {
  merchantLocationKey?: string
  name?: string
  merchantLocationStatus?: string
}

type EbayInventoryLocationsResponse = {
  locations?: EbayInventoryLocation[]
  total?: number
}

function sandboxLocationAddress() {
  return {
    addressLine1:
      process.env["EBAY_LOCATION_ADDRESS_LINE1"] || "212 Fitness Way",
    city: process.env["EBAY_LOCATION_CITY"] || "San Jose",
    stateOrProvince: process.env["EBAY_LOCATION_STATE"] || "CA",
    postalCode: process.env["EBAY_LOCATION_POSTAL"] || "95125",
    country: process.env["EBAY_LOCATION_COUNTRY"] || "US",
  }
}

async function listInventoryLocations(accessToken: string) {
  const payload = (await ebayFetch(
    "/sell/inventory/v1/location?limit=100",
    accessToken,
    { method: "GET" }
  )) as EbayInventoryLocationsResponse | null

  return payload?.locations ?? []
}

async function createInventoryLocation(
  accessToken: string,
  merchantLocationKey: string
) {
  // POST returns 204 No Content on success; key is the path segment we supply,
  // then confirmed via a subsequent GET of locations.
  await ebayFetch(
    `/sell/inventory/v1/location/${encodeURIComponent(merchantLocationKey)}`,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify({
        name: "ListWise Sandbox Warehouse",
        merchantLocationStatus: "ENABLED",
        locationTypes: ["WAREHOUSE"],
        location: {
          address: sandboxLocationAddress(),
        },
      }),
    }
  )
}

function pickEnabledLocationKey(locations: EbayInventoryLocation[]) {
  const enabled = locations.find(
    (loc) =>
      loc.merchantLocationKey &&
      (loc.merchantLocationStatus === "ENABLED" || !loc.merchantLocationStatus)
  )
  return enabled?.merchantLocationKey
}

/**
 * Ensure the connected eBay seller has an inventory location.
 * Preference order:
 * 1) connection.meta.merchantLocationKey (previously stored)
 * 2) existing Inventory API locations for this seller
 * 3) create a new Sandbox warehouse location, then store its key
 *
 * Never invents a key that was not created/listed via the Inventory API
 * (except optional env override EBAY_MERCHANT_LOCATION_KEY when set).
 */
export async function ensureEbayMerchantLocationKey(
  accessToken: string,
  connection: StoredMarketplaceConnection
): Promise<{ merchantLocationKey: string; connection: StoredMarketplaceConnection }> {
  const stored = connection.meta?.[META_LOCATION_KEY]?.trim()
  if (stored) {
    return { merchantLocationKey: stored, connection }
  }

  const envKey = process.env["EBAY_MERCHANT_LOCATION_KEY"]?.trim()
  if (envKey) {
    const next = await persistLocationKey(connection, envKey)
    return { merchantLocationKey: envKey, connection: next }
  }

  const existing = await listInventoryLocations(accessToken)
  const existingKey = pickEnabledLocationKey(existing)
  if (existingKey) {
    console.info("[ebay/location] using existing inventory location", {
      merchantLocationKey: existingKey,
    })
    const next = await persistLocationKey(connection, existingKey)
    return { merchantLocationKey: existingKey, connection: next }
  }

  const merchantLocationKey = `lw_${randomBytes(6).toString("hex")}` // <= 36 chars
  try {
    await createInventoryLocation(accessToken, merchantLocationKey)
  } catch (err) {
    // Race / already-exists: re-list and use whatever eBay has.
    const after = await listInventoryLocations(accessToken)
    const recovered = pickEnabledLocationKey(after)
    if (recovered) {
      const next = await persistLocationKey(connection, recovered)
      return { merchantLocationKey: recovered, connection: next }
    }
    throw err instanceof MarketplaceError
      ? err
      : new MarketplaceError(
          "Failed to create eBay inventory location.",
          "ebay_location_create_failed",
          502
        )
  }

  const confirmed = await listInventoryLocations(accessToken)
  const confirmedKey =
    pickEnabledLocationKey(confirmed) ||
    confirmed.find((loc) => loc.merchantLocationKey === merchantLocationKey)
      ?.merchantLocationKey

  if (!confirmedKey) {
    throw new MarketplaceError(
      "eBay inventory location was created but could not be read back.",
      "ebay_location_missing",
      502
    )
  }

  console.info("[ebay/location] created inventory location", {
    merchantLocationKey: confirmedKey,
  })
  const next = await persistLocationKey(connection, confirmedKey)
  return { merchantLocationKey: confirmedKey, connection: next }
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
  return next
}
