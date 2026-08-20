/**
 * Listing-level shipping as seller concepts (not Business Policies).
 * The eBay adapter maps this snapshot onto fulfillment / return / location APIs.
 */

import {
  defaultEbayShippingMode,
  formatHandlingTime,
  type EbayShippingMode,
  type BuildFulfillmentPolicyArgs,
} from "@/lib/marketplaces/adapters/ebay/fulfillment-shipping"
import {
  shippingServiceLabel,
  shippingWhoPaysLabel,
} from "@/lib/seller/ebay-defaults"
import { resolveEbayShippingService } from "@/lib/marketplaces/adapters/ebay/shipping-service-resolve"
import {
  shippingPackageIsComplete,
  totalWeightPounds,
  type ShippingPackage,
} from "@/lib/listings/shipping-package"
import type { Listing, ListingShippingPackage } from "@/lib/types"

export type ListingShippingIntent = {
  deliveryMethod: "shipping_only"
  mode: EbayShippingMode
  shippingServiceCode: string
  shippingServiceLabel: string
  whoPays: "buyer" | "seller"
  costType: "CALCULATED" | "FLAT_RATE"
  flatAmount: number | null
  freeShippingConfirmed: boolean
  international: boolean
  handlingTimeDays: number
  itemLocationZip: string | null
  returnsAccepted: boolean
  returnWindowDays: 30 | 60
  returnShippingPaidBy: "BUYER" | "SELLER"
  package: ListingShippingPackage | null
  irregularPackage: boolean
}

export function listingItemLocationZip(listing: Listing): string | null {
  const fromSpecifics = listing.specifics.itemLocationZip?.trim()
  if (fromSpecifics) return fromSpecifics
  const fromExtras = listing.specifics.extras?.itemLocationZip?.trim()
  return fromExtras || null
}

export function listingInternationalShipping(listing: Listing): boolean {
  if (listing.specifics.internationalShipping === true) return true
  const extra = listing.specifics.extras?.internationalShipping?.trim().toLowerCase()
  return extra === "true" || extra === "1" || extra === "yes"
}

export function listingShippingServiceCode(listing: Listing): string {
  const preferred =
    listing.specifics.shippingService?.trim() ||
    listing.specifics.extras?.shippingService?.trim() ||
    ""
  return resolveEbayShippingService({
    marketplaceId: listing.specifics.ebayCategory?.marketplaceId,
    categoryId: listing.specifics.ebayCategory?.categoryId,
    categoryName: listing.specifics.ebayCategory?.categoryName,
    categoryPath: listing.specifics.ebayCategory?.categoryPath,
    listingCategory: listing.specifics.category,
    title: listing.title,
    price: listing.price,
    currency: listing.currency,
    package: listing.specifics.shippingPackage || null,
    sellerPreferredService: preferred || null,
    shippingMode: listing.specifics.shippingMode,
  }).code
}

export function listingShippingIntent(listing: Listing): ListingShippingIntent {
  const mode = defaultEbayShippingMode(listing.specifics.shippingMode)
  const service = listingShippingServiceCode(listing)
  const handling =
    typeof listing.specifics.handlingTimeDays === "number" &&
    Number.isFinite(listing.specifics.handlingTimeDays)
      ? Math.max(0, Math.min(30, Math.floor(listing.specifics.handlingTimeDays)))
      : 1
  const pkg = listing.specifics.shippingPackage || null
  const irregular = Boolean(
    pkg?.irregularPackage ||
      listing.specifics.extras?.irregularPackage === "true"
  )
  const zip = listingItemLocationZip(listing)
  const returnsAccepted = listing.specifics.returnsAccepted !== false

  return {
    deliveryMethod: "shipping_only",
    mode,
    shippingServiceCode: service,
    shippingServiceLabel: shippingServiceLabel(service),
    whoPays: mode === "free" ? "seller" : "buyer",
    costType: mode === "calculated" ? "CALCULATED" : "FLAT_RATE",
    flatAmount:
      mode === "flat" && listing.specifics.flatShippingAmount != null
        ? listing.specifics.flatShippingAmount
        : null,
    freeShippingConfirmed: Boolean(listing.specifics.freeShippingConfirmed),
    international: listingInternationalShipping(listing),
    handlingTimeDays: handling,
    itemLocationZip: zip,
    returnsAccepted,
    returnWindowDays: listing.specifics.returnWindowDays === 60 ? 60 : 30,
    returnShippingPaidBy:
      listing.specifics.returnShippingPaidBy === "SELLER" ? "SELLER" : "BUYER",
    package: pkg,
    irregularPackage: irregular,
  }
}

/** Account API create body args — listing concepts only, no extra LSAS fields. */
export function fulfillmentPolicyArgsFromIntent(
  intent: ListingShippingIntent,
  marketplaceId = "EBAY_US"
): Omit<BuildFulfillmentPolicyArgs, "name" | "template" | "shape"> {
  return {
    marketplaceId,
    mode: intent.mode,
    handlingDays: intent.handlingTimeDays,
    shippingServiceCode: intent.shippingServiceCode,
    flatAmount: intent.flatAmount ?? undefined,
    setAsDefault: false,
  }
}

export function reviewShippingSummary(listing: Listing): string {
  const intent = listingShippingIntent(listing)
  const who =
    intent.whoPays === "seller" ? "Seller pays" : "Buyer pays"
  return `${intent.shippingServiceLabel} — ${who}`
}

export function reviewShippingCostSummary(listing: Listing): string {
  const intent = listingShippingIntent(listing)
  if (intent.mode === "free") return "Free shipping"
  if (intent.mode === "flat") {
    const amount = intent.flatAmount
    return amount != null
      ? `Flat $${amount.toFixed(2)}`
      : "Flat rate"
  }
  return shippingWhoPaysLabel(intent.mode)
}

export function formatPackageSummary(
  pkg: ShippingPackage | ListingShippingPackage | null | undefined
): string {
  if (!pkg || !shippingPackageIsComplete(pkg)) {
    return "Package details needed"
  }
  const pounds = pkg.weightPounds ?? 0
  const ounces = pkg.weightOunces ?? 0
  const weight =
    pounds > 0 && ounces > 0
      ? `${pounds} lb ${ounces} oz`
      : pounds > 0
        ? `${pounds} lb`
        : `${ounces} oz`
  const dims = `${pkg.lengthInches} × ${pkg.widthInches} × ${pkg.heightInches} in`
  const irregular = pkg.irregularPackage ? " · Irregular" : ""
  return `${weight} · ${dims}${irregular}`
}

export function reviewPackageSummary(listing: Listing): string {
  return formatPackageSummary(listing.specifics.shippingPackage)
}

export function reviewReturnsHandlingSummary(listing: Listing): string {
  const intent = listingShippingIntent(listing)
  const returns = intent.returnsAccepted
    ? `${intent.returnWindowDays}-day returns · ${
        intent.returnShippingPaidBy === "SELLER" ? "Seller" : "Buyer"
      } pays return shipping`
    : "Returns not accepted"
  return `${returns} · Handling ${formatHandlingTime(intent.handlingTimeDays)}`
}

export function reviewOffersSummary(listing: Listing): string {
  if (listing.specifics.allowOffers !== true) return "Offers off"
  const extras = listing.specifics.extras || {}
  const bits = ["Offers on"]
  if (extras.minOfferAmount) bits.push(`min $${extras.minOfferAmount}`)
  if (extras.minOfferPercent) bits.push(`min ${extras.minOfferPercent}%`)
  return bits.join(" · ")
}

export function reviewItemLocationSummary(listing: Listing): string | null {
  const zip = listingItemLocationZip(listing)
  return zip ? `Ships from ${zip}` : null
}

export function packageWeightPoundsTotal(
  pkg: Pick<ShippingPackage, "weightPounds" | "weightOunces">
): number {
  return totalWeightPounds(pkg)
}
