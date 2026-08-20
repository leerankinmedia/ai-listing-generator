"use client"

import {
  groupedParcelShippingOptions,
  type ParcelCarrierId,
} from "@/lib/marketplaces/adapters/ebay/shipping-service-resolve"
import type { Listing } from "@/lib/types"

const CARRIER_LABEL: Record<ParcelCarrierId, string> = {
  USPS: "USPS",
  UPS: "UPS",
  FedEx: "FedEx",
}

export function ShippingServiceSelect({
  id,
  value,
  onChange,
  disabled,
  listing,
}: {
  id?: string
  value: string
  onChange: (code: string) => void
  disabled?: boolean
  listing?: Listing
}) {
  const groups = groupedParcelShippingOptions(
    listing
      ? {
          marketplaceId: listing.specifics.ebayCategory?.marketplaceId,
          categoryId: listing.specifics.ebayCategory?.categoryId,
          categoryName: listing.specifics.ebayCategory?.categoryName,
          categoryPath: listing.specifics.ebayCategory?.categoryPath,
          listingCategory: listing.specifics.category,
          title: listing.title,
          price: listing.price,
          currency: listing.currency,
          package: listing.specifics.shippingPackage || null,
        }
      : undefined
  )
  const known = groups.some((group) =>
    group.options.some((option) => option.value === value)
  )

  return (
    <select
      id={id}
      disabled={disabled}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="flex h-11 w-full rounded-lg border border-input bg-card px-3.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {!known && value ? (
        <option value={value}>{value}</option>
      ) : null}
      {groups.map((group) => (
        <optgroup key={group.carrier} label={CARRIER_LABEL[group.carrier]}>
          {group.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}
