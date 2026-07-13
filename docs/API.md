# Listora API — Phase 1

Base URL: your deployed origin (local: `http://localhost:3000`)

## `POST /api/generate-listing`

Generate an eBay-optimized listing from product photos and optional seller context.

### Request

`multipart/form-data`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `photos` | File[] | yes | 1–6 images, image/*, ≤ ~4.5MB each |
| `brand` | string | no | Seller-known brand |
| `categoryHint` | string | no | Free-text category hint |
| `condition` | enum | no | `new_with_tags`, `new_without_tags`, `like_new`, `good`, `fair`, `for_parts` |
| `cost` | number | no | Seller cost basis (USD) |
| `notes` | string | no | Flaws, size, measurements, etc. |

### Success response `200`

```json
{
  "data": {
    "listing": {
      "title": "string (optimized toward 70–80 chars)",
      "titleAlternates": ["..."],
      "description": "plain text",
      "category": {
        "primary": "string",
        "breadcrumb": "string",
        "ebayCategoryIdHint": "optional",
        "alternatives": ["optional"]
      },
      "condition": "string",
      "itemSpecifics": { "Brand": "Nike", "Size": "10" },
      "keywords": ["..."],
      "pricing": {
        "suggestedPrice": 0,
        "priceLow": 0,
        "priceHigh": 0,
        "currency": "USD",
        "rationale": "string",
        "estimatedDaysToSell": 0
      },
      "confidence": {
        "overall": 0,
        "title": 0,
        "category": 0,
        "itemSpecifics": 0,
        "pricing": 0,
        "description": 0
      },
      "missingInformation": [
        {
          "field": "size",
          "severity": "critical",
          "message": "...",
          "suggestion": "..."
        }
      ],
      "identifiedItem": {
        "brand": "optional",
        "productName": "optional",
        "model": "optional",
        "color": "optional",
        "size": "optional",
        "material": "optional",
        "summary": "string"
      }
    },
    "meta": {
      "model": "gpt-4o",
      "titleLength": 76,
      "titleInOptimalRange": true,
      "generatedAt": "ISO-8601"
    }
  }
}
```

### Errors

| Status | When |
|--------|------|
| 400 | Validation / missing photos / too many / oversized |
| 503 | `OPENAI_API_KEY` not configured |
| 500 | Upstream or unexpected failure |

Envelope: `{ "error": { "message": string, "details?": unknown } }`

### Auth

Phase 1 is open (no auth). Phase 2 will require Supabase JWT + active trial/subscription.
