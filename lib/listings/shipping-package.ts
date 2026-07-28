/**
 * Seller-entered shipping package for eBay Inventory packageWeightAndSize.
 * Never invent weight/dims for AI or imported clothing — require user input
 * or a saved preset before publish.
 */

export const EBAY_PACKAGE_TYPES = [
  { value: "PACKAGE_THICK_ENVELOPE", label: "Thick envelope / poly mailer" },
  { value: "PARCEL_OR_PADDED_ENVELOPE", label: "Parcel or padded envelope" },
  { value: "PADDED_BAGS", label: "Padded bag" },
  { value: "MAILING_BOX", label: "Mailing box" },
  { value: "LARGE_ENVELOPE", label: "Large envelope" },
  { value: "LETTER", label: "Letter" },
  { value: "USPS_FLAT_RATE_ENVELOPE", label: "USPS flat rate envelope" },
  { value: "USPS_LARGE_PACK", label: "USPS large pack" },
  { value: "CUSTOM_PACKAGE", label: "Custom package" },
] as const

export type EbayPackageTypeValue = (typeof EBAY_PACKAGE_TYPES)[number]["value"]

export interface ShippingPackage {
  /** Whole pounds (0+). Combined with ounces must be > 0. Null = blank / unset. */
  weightPounds: number | null
  /** Extra ounces (0–15 preferred; values ≥16 are normalized). Null = blank. */
  weightOunces: number | null
  lengthInches: number | null
  widthInches: number | null
  heightInches: number | null
  packageType: EbayPackageTypeValue | string
}

export interface ShippingPackagePreset extends ShippingPackage {
  id: string
  name: string
}

export const SHIPPING_PRESET_STORAGE_KEY = "listwise.shippingPackagePresets"
/** Last complete package used (auto-remembered — one tap next listing). */
export const LAST_SHIPPING_PACKAGE_KEY = "listwise.lastShippingPackage"

const FIELD_LABELS: Record<string, string> = {
  weightPounds: "weight pounds",
  weightOunces: "weight ounces",
  lengthInches: "package length",
  widthInches: "package width",
  heightInches: "package height",
  weight: "package weight (pounds + ounces)",
}

export const DEFAULT_EBAY_PACKAGE_TYPE = "PACKAGE_THICK_ENVELOPE"

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return null
}

/** Normalize ounces into pounds + 0–15 ounces. */
export function normalizeShippingWeight(
  pounds: number,
  ounces: number
): { weightPounds: number; weightOunces: number } {
  const totalOz = Math.max(0, pounds) * 16 + Math.max(0, ounces)
  const wholePounds = Math.floor(totalOz / 16)
  const remOz = Number((totalOz - wholePounds * 16).toFixed(3))
  return { weightPounds: wholePounds, weightOunces: remOz }
}

export function totalWeightPounds(pkg: Pick<ShippingPackage, "weightPounds" | "weightOunces">): number {
  const p = asFiniteNumber(pkg.weightPounds) ?? 0
  const o = asFiniteNumber(pkg.weightOunces) ?? 0
  return p + o / 16
}

/**
 * Returns human-readable labels for every missing/invalid package field.
 * Empty package → all required fields listed (do not invent defaults).
 */
export function missingShippingPackageFields(
  pkg: ShippingPackage | null | undefined
): string[] {
  if (!pkg) {
    return [
      FIELD_LABELS.weightPounds,
      FIELD_LABELS.weightOunces,
      FIELD_LABELS.lengthInches,
      FIELD_LABELS.widthInches,
      FIELD_LABELS.heightInches,
    ]
  }

  const missing: string[] = []
  const pounds = asFiniteNumber(pkg.weightPounds)
  // Ounces may be blank when pounds are set — treat as 0 (saves a tap).
  const ouncesRaw = asFiniteNumber(pkg.weightOunces)
  const ounces = ouncesRaw == null && pounds != null && pounds >= 0 ? 0 : ouncesRaw

  if (pounds == null || pounds < 0 || !Number.isFinite(pounds)) {
    missing.push(FIELD_LABELS.weightPounds)
  }
  if (ounces == null || ounces < 0 || !Number.isFinite(ounces)) {
    // Only require ounces when pounds aren't set yet (seller must enter some weight).
    if (pounds == null) missing.push(FIELD_LABELS.weightOunces)
  }
  if (
    pounds != null &&
    ounces != null &&
    pounds >= 0 &&
    ounces >= 0 &&
    totalWeightPounds({ weightPounds: pounds, weightOunces: ounces }) <= 0
  ) {
    if (!missing.includes(FIELD_LABELS.weightPounds)) {
      missing.push(FIELD_LABELS.weight)
    }
  }

  for (const [key, label] of [
    ["lengthInches", FIELD_LABELS.lengthInches],
    ["widthInches", FIELD_LABELS.widthInches],
    ["heightInches", FIELD_LABELS.heightInches],
  ] as const) {
    const n = asFiniteNumber(pkg[key])
    if (n == null || n <= 0) missing.push(label)
  }

  // packageType is auto-defaulted — never surface to sellers.
  return missing
}

export function formatMissingShippingPackageMessage(missing: string[]): string {
  if (missing.length === 0) return ""
  return `Enter shipping package details before publishing to eBay. Missing: ${missing.join(", ")}.`
}

export function shippingPackageIsComplete(
  pkg: ShippingPackage | null | undefined
): boolean {
  return missingShippingPackageFields(pkg).length === 0
}

/** Inventory API packageWeightAndSize body (US inches + pounds). */
export function toEbayPackageWeightAndSize(pkg: ShippingPackage): {
  dimensions: {
    height: number
    length: number
    width: number
    unit: "INCH"
  }
  weight: { value: number; unit: "POUND" }
  packageType: string
} {
  const { weightPounds, weightOunces } = normalizeShippingWeight(
    asFiniteNumber(pkg.weightPounds) ?? 0,
    asFiniteNumber(pkg.weightOunces) ?? 0
  )
  const weightValue = Number((weightPounds + weightOunces / 16).toFixed(3))
  const packageType =
    String(pkg.packageType || "").trim() || DEFAULT_EBAY_PACKAGE_TYPE
  return {
    dimensions: {
      length: Number((asFiniteNumber(pkg.lengthInches) ?? 0).toFixed(2)),
      width: Number((asFiniteNumber(pkg.widthInches) ?? 0).toFixed(2)),
      height: Number((asFiniteNumber(pkg.heightInches) ?? 0).toFixed(2)),
      unit: "INCH",
    },
    weight: {
      value: weightValue,
      unit: "POUND",
    },
    packageType,
  }
}

export function readShippingPresets(): ShippingPackagePreset[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(SHIPPING_PRESET_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((p) => p && typeof p === "object")
      .map((p) => {
        const row = p as Record<string, unknown>
        return {
          id: String(row.id || ""),
          name: String(row.name || "Preset"),
          weightPounds: asFiniteNumber(row.weightPounds) ?? 0,
          weightOunces: asFiniteNumber(row.weightOunces) ?? 0,
          lengthInches: asFiniteNumber(row.lengthInches) ?? 0,
          widthInches: asFiniteNumber(row.widthInches) ?? 0,
          heightInches: asFiniteNumber(row.heightInches) ?? 0,
          packageType: String(row.packageType || ""),
        } satisfies ShippingPackagePreset
      })
      .filter((p) => p.id)
  } catch {
    return []
  }
}

export function writeShippingPresets(presets: ShippingPackagePreset[]) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(
    SHIPPING_PRESET_STORAGE_KEY,
    JSON.stringify(presets.slice(0, 20))
  )
}

export function saveShippingPreset(
  name: string,
  pkg: ShippingPackage
): ShippingPackagePreset[] {
  const presets = readShippingPresets()
  const id =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `preset_${Date.now()}`
  const next: ShippingPackagePreset = {
    id,
    name: name.trim() || "Saved package",
    ...pkg,
  }
  const updated = [next, ...presets.filter((p) => p.name !== next.name)].slice(
    0,
    20
  )
  writeShippingPresets(updated)
  return updated
}

function readLastShippingPackage(): ShippingPackage | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(LAST_SHIPPING_PACKAGE_KEY)
    if (!raw) return null
    const row = JSON.parse(raw) as Record<string, unknown>
    if (!row || typeof row !== "object") return null
    const pkg: ShippingPackage = {
      weightPounds: asFiniteNumber(row.weightPounds),
      weightOunces: asFiniteNumber(row.weightOunces),
      lengthInches: asFiniteNumber(row.lengthInches),
      widthInches: asFiniteNumber(row.widthInches),
      heightInches: asFiniteNumber(row.heightInches),
      packageType: String(row.packageType || DEFAULT_EBAY_PACKAGE_TYPE),
    }
    return shippingPackageIsComplete(pkg) ? pkg : null
  } catch {
    return null
  }
}

/**
 * Remember the last complete package so the next listing needs zero shipping taps
 * (beats Vendoo defaults / Nifty similar-listing prefills on mobile).
 */
export function rememberLastShippingPackage(pkg: ShippingPackage): void {
  if (typeof window === "undefined") return
  if (!shippingPackageIsComplete(pkg)) return
  const normalized: ShippingPackage = {
    weightPounds: asFiniteNumber(pkg.weightPounds) ?? 0,
    weightOunces: asFiniteNumber(pkg.weightOunces) ?? 0,
    lengthInches: asFiniteNumber(pkg.lengthInches) ?? 0,
    widthInches: asFiniteNumber(pkg.widthInches) ?? 0,
    heightInches: asFiniteNumber(pkg.heightInches) ?? 0,
    packageType: String(pkg.packageType || "").trim() || DEFAULT_EBAY_PACKAGE_TYPE,
  }
  window.localStorage.setItem(LAST_SHIPPING_PACKAGE_KEY, JSON.stringify(normalized))
}

/** Most recently used/saved package (Vendoo/Nifty-style defaultable shipping). */
export function getLastShippingPreset(): ShippingPackagePreset | null {
  const last = readLastShippingPackage()
  if (last) {
    return {
      id: "last-used",
      name: "Last used",
      ...last,
    }
  }
  const presets = readShippingPresets()
  return presets[0] || null
}

/**
 * Apply the last shipping package when the listing has none complete.
 * Returns the listing unchanged when a complete package already exists.
 */
export function applyLastShippingPresetToListing<
  T extends {
    specifics: { shippingPackage?: ShippingPackage | null }
    updatedAt?: string
  },
>(listing: T): T {
  if (shippingPackageIsComplete(listing.specifics.shippingPackage)) {
    return listing
  }
  const last = getLastShippingPreset()
  if (!last) return listing
  const { id: _id, name: _name, ...pkg } = last
  return {
    ...listing,
    specifics: {
      ...listing.specifics,
      shippingPackage: {
        ...pkg,
        packageType: pkg.packageType || DEFAULT_EBAY_PACKAGE_TYPE,
      },
    },
    updatedAt: new Date().toISOString(),
  }
}
