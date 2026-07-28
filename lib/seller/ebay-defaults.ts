/**
 * eBay seller defaults — configure once, apply to every new listing.
 * Business policy IDs stay invisible; ListWise maps these to policies on publish.
 */

import type { Listing, ListingShippingPackage } from "@/lib/types"
import type { EbayShippingMode } from "@/lib/marketplaces/adapters/ebay/fulfillment-shipping"
import {
  DEFAULT_EBAY_PACKAGE_TYPE,
  shippingPackageIsComplete,
  type ShippingPackage,
} from "@/lib/listings/shipping-package"

export const EBAY_HANDLING_TIME_OPTIONS = [
  { value: 0, label: "Same business day" },
  { value: 1, label: "1 business day" },
  { value: 2, label: "2 business days" },
  { value: 3, label: "3 business days" },
  { value: 4, label: "4 business days" },
  { value: 5, label: "5 business days" },
  { value: 10, label: "10 business days" },
  { value: 15, label: "15 business days" },
  { value: 20, label: "20 business days" },
  { value: 30, label: "30 business days" },
] as const

export type EbayHandlingTimeDays =
  (typeof EBAY_HANDLING_TIME_OPTIONS)[number]["value"]

export const EBAY_SHIPPING_SERVICE_OPTIONS = [
  {
    value: "USPSGroundAdvantage",
    label: "USPS Ground Advantage",
  },
  {
    value: "USPSPriority",
    label: "USPS Priority Mail",
  },
  {
    value: "UPSGround",
    label: "UPS Ground",
  },
  {
    value: "FedExHomeDelivery",
    label: "FedEx Ground / Home Delivery",
  },
] as const

export type EbayShippingServiceCode =
  (typeof EBAY_SHIPPING_SERVICE_OPTIONS)[number]["value"]

export const EBAY_RETURN_WINDOW_OPTIONS = [
  { value: 30, label: "30 days" },
  { value: 60, label: "60 days" },
] as const

export type EbayReturnWindowDays =
  (typeof EBAY_RETURN_WINDOW_OPTIONS)[number]["value"]

export type EbayPromotedListingsMode = "off" | "dynamic" | "custom"

export interface EbaySellerDefaults {
  handlingTimeDays: EbayHandlingTimeDays
  shippingMode: EbayShippingMode
  shippingService: EbayShippingServiceCode
  /** Flat rate USD when shippingMode is flat. Null = unset. */
  flatShippingAmount: number | null
  package: ShippingPackage | null
  itemLocationZip: string
  returnsAccepted: boolean
  returnWindowDays: EbayReturnWindowDays
  returnShippingPaidBy: "BUYER" | "SELLER"
  refundMethod: "MONEY_BACK"
  requireImmediatePayment: boolean
  allowOffers: boolean
  /** Absolute USD floor for offers (optional). */
  minOfferAmount: number | null
  /** Percent of list price as floor (optional). */
  minOfferPercent: number | null
  autoDeclineAmount: number | null
  autoDeclinePercent: number | null
  promotedListings: EbayPromotedListingsMode
  /** Custom ad rate 2.0–100.0 when promotedListings is custom. */
  promotedListingsPercent: number | null
}

export const DEFAULT_EBAY_SELLER_DEFAULTS: EbaySellerDefaults = {
  handlingTimeDays: 1,
  shippingMode: "calculated",
  shippingService: "USPSGroundAdvantage",
  flatShippingAmount: null,
  package: null,
  itemLocationZip: "",
  returnsAccepted: true,
  returnWindowDays: 30,
  returnShippingPaidBy: "BUYER",
  refundMethod: "MONEY_BACK",
  requireImmediatePayment: false,
  allowOffers: false,
  minOfferAmount: null,
  minOfferPercent: null,
  autoDeclineAmount: null,
  autoDeclinePercent: null,
  promotedListings: "off",
  promotedListingsPercent: null,
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return null
}

function asHandlingDays(value: unknown): EbayHandlingTimeDays {
  const n = asFiniteNumber(value)
  const allowed = EBAY_HANDLING_TIME_OPTIONS.map((o) => o.value)
  if (n != null && (allowed as number[]).includes(n)) {
    return n as EbayHandlingTimeDays
  }
  return 1
}

function asShippingService(value: unknown): EbayShippingServiceCode {
  const raw = String(value || "").trim()
  const match = EBAY_SHIPPING_SERVICE_OPTIONS.find((o) => o.value === raw)
  return match?.value || "USPSGroundAdvantage"
}

function asShippingMode(value: unknown): EbayShippingMode {
  if (value === "flat" || value === "free" || value === "calculated") return value
  return "calculated"
}

function asPackage(value: unknown): ShippingPackage | null {
  if (!value || typeof value !== "object") return null
  const row = value as Record<string, unknown>
  const pkg: ShippingPackage = {
    weightPounds: asFiniteNumber(row.weightPounds),
    weightOunces: asFiniteNumber(row.weightOunces),
    lengthInches: asFiniteNumber(row.lengthInches),
    widthInches: asFiniteNumber(row.widthInches),
    heightInches: asFiniteNumber(row.heightInches),
    packageType: String(row.packageType || DEFAULT_EBAY_PACKAGE_TYPE),
  }
  return shippingPackageIsComplete(pkg) ? pkg : pkg
}

export function normalizeEbaySellerDefaults(
  raw: unknown
): EbaySellerDefaults {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_EBAY_SELLER_DEFAULTS }
  }
  const row = raw as Record<string, unknown>
  const promoted =
    row.promotedListings === "dynamic" || row.promotedListings === "custom"
      ? row.promotedListings
      : "off"
  let promotedPercent = asFiniteNumber(row.promotedListingsPercent)
  if (promotedPercent != null) {
    promotedPercent = Math.max(2, Math.min(100, Number(promotedPercent.toFixed(1))))
  }

  return {
    handlingTimeDays: asHandlingDays(row.handlingTimeDays),
    shippingMode: asShippingMode(row.shippingMode),
    shippingService: asShippingService(row.shippingService),
    flatShippingAmount: asFiniteNumber(row.flatShippingAmount),
    package: asPackage(row.package),
    itemLocationZip: String(row.itemLocationZip || "")
      .replace(/\D/g, "")
      .slice(0, 10),
    returnsAccepted: row.returnsAccepted !== false,
    returnWindowDays:
      asFiniteNumber(row.returnWindowDays) === 60 ? 60 : 30,
    returnShippingPaidBy:
      row.returnShippingPaidBy === "SELLER" ? "SELLER" : "BUYER",
    refundMethod: "MONEY_BACK",
    requireImmediatePayment: row.requireImmediatePayment === true,
    allowOffers: row.allowOffers === true,
    minOfferAmount: asFiniteNumber(row.minOfferAmount),
    minOfferPercent: asFiniteNumber(row.minOfferPercent),
    autoDeclineAmount: asFiniteNumber(row.autoDeclineAmount),
    autoDeclinePercent: asFiniteNumber(row.autoDeclinePercent),
    promotedListings: promoted,
    promotedListingsPercent: promotedPercent,
  }
}

export function handlingTimeLabel(days: number | null | undefined): string {
  const match = EBAY_HANDLING_TIME_OPTIONS.find((o) => o.value === days)
  return match?.label || "1 business day"
}

export function shippingServiceLabel(code: string | null | undefined): string {
  const match = EBAY_SHIPPING_SERVICE_OPTIONS.find((o) => o.value === code)
  return match?.label || code || "USPS Ground Advantage"
}

export function shippingWhoPaysLabel(mode: EbayShippingMode): string {
  if (mode === "free") return "Free shipping (you pay)"
  if (mode === "flat") return "Buyer pays (flat rate)"
  return "Buyer pays (calculated)"
}

/** Missing required seller-default fields for a complete setup. */
export function missingEbaySellerDefaultFields(
  defaults: EbaySellerDefaults
): string[] {
  const missing: string[] = []
  if (!defaults.itemLocationZip || defaults.itemLocationZip.length < 5) {
    missing.push("item location ZIP")
  }
  if (defaults.shippingMode === "flat") {
    const amt = defaults.flatShippingAmount
    if (amt == null || amt < 0) missing.push("flat shipping amount")
  }
  if (!shippingPackageIsComplete(defaults.package)) {
    missing.push("default package weight and dimensions")
  }
  if (defaults.promotedListings === "custom") {
    const p = defaults.promotedListingsPercent
    if (p == null || p < 2 || p > 100) {
      missing.push("custom promoted listing percentage (2–100)")
    }
  }
  return missing
}

export function ebaySellerDefaultsAreReady(
  defaults: EbaySellerDefaults | null | undefined
): boolean {
  if (!defaults) return false
  return missingEbaySellerDefaultFields(defaults).length === 0
}

/**
 * Apply saved seller defaults onto a listing without overwriting seller edits
 * when `onlyIfUnset` is true (new drafts).
 */
export function applyEbaySellerDefaultsToListing(
  listing: Listing,
  defaults: EbaySellerDefaults,
  options: { onlyIfUnset?: boolean } = {}
): Listing {
  const onlyIfUnset = options.onlyIfUnset !== false
  const specifics = { ...listing.specifics }
  const extras = { ...(specifics.extras || {}) }

  const setIf = <K extends keyof typeof specifics>(
    key: K,
    value: (typeof specifics)[K],
    isUnset: boolean
  ) => {
    if (!onlyIfUnset || isUnset) {
      specifics[key] = value
    }
  }

  setIf(
    "handlingTimeDays",
    defaults.handlingTimeDays,
    specifics.handlingTimeDays == null
  )
  setIf(
    "shippingMode",
    defaults.shippingMode,
    !specifics.shippingMode
  )
  setIf(
    "shippingService",
    defaults.shippingService,
    !specifics.shippingService
  )
  if (
    defaults.shippingMode === "flat" &&
    defaults.flatShippingAmount != null &&
    (!onlyIfUnset || specifics.flatShippingAmount == null)
  ) {
    specifics.flatShippingAmount = defaults.flatShippingAmount
  }
  if (
    defaults.package &&
    shippingPackageIsComplete(defaults.package) &&
    (!onlyIfUnset || !shippingPackageIsComplete(specifics.shippingPackage))
  ) {
    specifics.shippingPackage = {
      ...defaults.package,
    } satisfies ListingShippingPackage
  }
  setIf(
    "allowOffers",
    defaults.allowOffers,
    specifics.allowOffers == null
  )
  setIf(
    "returnsAccepted",
    defaults.returnsAccepted,
    specifics.returnsAccepted == null
  )
  setIf(
    "returnWindowDays",
    defaults.returnWindowDays,
    specifics.returnWindowDays == null
  )
  setIf(
    "returnShippingPaidBy",
    defaults.returnShippingPaidBy,
    !specifics.returnShippingPaidBy
  )
  setIf(
    "requireImmediatePayment",
    defaults.requireImmediatePayment,
    specifics.requireImmediatePayment == null
  )
  setIf(
    "promotedListings",
    defaults.promotedListings,
    !specifics.promotedListings
  )
  if (
    defaults.promotedListings === "custom" &&
    defaults.promotedListingsPercent != null &&
    (!onlyIfUnset || specifics.promotedListingsPercent == null)
  ) {
    specifics.promotedListingsPercent = defaults.promotedListingsPercent
  }

  if (defaults.itemLocationZip && (!onlyIfUnset || !extras.itemLocationZip)) {
    extras.itemLocationZip = defaults.itemLocationZip
  }
  if (defaults.minOfferAmount != null && (!onlyIfUnset || !extras.minOfferAmount)) {
    extras.minOfferAmount = String(defaults.minOfferAmount)
  }
  if (
    defaults.minOfferPercent != null &&
    (!onlyIfUnset || !extras.minOfferPercent)
  ) {
    extras.minOfferPercent = String(defaults.minOfferPercent)
  }
  if (
    defaults.autoDeclineAmount != null &&
    (!onlyIfUnset || !extras.autoDeclineAmount)
  ) {
    extras.autoDeclineAmount = String(defaults.autoDeclineAmount)
  }
  if (
    defaults.autoDeclinePercent != null &&
    (!onlyIfUnset || !extras.autoDeclinePercent)
  ) {
    extras.autoDeclinePercent = String(defaults.autoDeclinePercent)
  }

  specifics.extras = extras
  return {
    ...listing,
    specifics,
    updatedAt: new Date().toISOString(),
  }
}

/** Resolve absolute offer floor from amount or % of list price. */
export function resolveOfferPriceFloor(
  listPrice: number,
  amount: number | null | undefined,
  percent: number | null | undefined
): number | null {
  const fromAmount =
    amount != null && Number.isFinite(amount) && amount > 0 ? amount : null
  const fromPercent =
    percent != null &&
    Number.isFinite(percent) &&
    percent > 0 &&
    listPrice > 0
      ? Number(((listPrice * percent) / 100).toFixed(2))
      : null
  if (fromAmount != null && fromPercent != null) {
    return Math.max(fromAmount, fromPercent)
  }
  return fromAmount ?? fromPercent
}
