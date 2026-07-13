# POST `/api/generate-listing`

Generate an eBay-optimized listing from seller input and optional product photos.

## Auth

Phase 1: open (no auth). Phase 2+: authenticated + plan-gated.

## Request body

```json
{
  "notes": "Nike Dunk Low Panda, lightly worn, box not included",
  "brand": "Nike",
  "categoryHint": "Athletic Shoes",
  "condition": "Pre-owned - Good",
  "size": "10",
  "color": "Black/White",
  "material": "Leather",
  "cost": 45,
  "targetMarginPercent": 55,
  "marketplace": "ebay",
  "imageDataUrls": ["data:image/jpeg;base64,..."]
}
```

| Field | Type | Notes |
|-------|------|--------|
| `notes` | string | Freeform seller notes (max 2000) |
| `brand` | string | Optional but strongly recommended |
| `categoryHint` | string | Helps taxonomy |
| `condition` | enum | See `CONDITIONS` in `types/listing.ts` |
| `size` / `color` / `material` | string | Item specifics seeds |
| `cost` | number | Purchase cost for profit math |
| `targetMarginPercent` | number | Default 55 |
| `marketplace` | `"ebay"` | Only eBay in Phase 1 |
| `imageDataUrls` | string[] | Up to 8 data URLs; first 4 sent to vision |

## Response `200`

```json
{
  "data": {
    "title": "Nike Dunk Low Panda Mens Size 10 Black White Leather Sneakers Good",
    "description": "...",
    "category": { "name": "Athletic Shoes", "path": "...", "ebayCategoryId": "15709" },
    "itemSpecifics": { "Brand": "Nike", "Size": "10", "Color": "Black/White" },
    "keywords": ["nike dunk", "panda", "size 10"],
    "pricing": {
      "suggestedPrice": 98,
      "lowPrice": 80,
      "highPrice": 120,
      "currency": "USD",
      "rationale": "...",
      "estimatedProfit": 53
    },
    "confidence": {
      "overall": 82,
      "title": 90,
      "description": 80,
      "category": 85,
      "itemSpecifics": 78,
      "pricing": 74
    },
    "warnings": [
      {
        "field": "photos",
        "severity": "info",
        "message": "...",
        "suggestion": "..."
      }
    ],
    "detectedAttributes": { "brand": "Nike", "color": "Black/White" }
  },
  "meta": {
    "mode": "live",
    "model": "gpt-4o",
    "generatedAt": "2026-07-13T12:00:00.000Z"
  }
}
```

`meta.mode` is `"demo"` when `OPENAI_API_KEY` is unset.

## Errors

| Status | Code | When |
|--------|------|------|
| 400 | `VALIDATION_ERROR` | Zod validation failed |
| 500 | `GENERATION_FAILED` | Model or unexpected error |

## Title contract

Post-processing enforces eBay SEO titles in the **70–80 character** window via `fitEbayTitle`.
