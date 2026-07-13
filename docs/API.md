# Listora API — Phase 1

## Generate listing

### `POST /api/generate-listing`
Alias: `POST /api/ai/generate-listing`

Creates an eBay-optimized listing draft from product photos using vision + structured output.

#### Request body

```json
{
  "images": ["data:image/jpeg;base64,..."],
  "notes": "Nike size M, thrift find",
  "conditionHint": "Pre-owned - Good",
  "costBasis": 12.5,
  "targetMarketplace": "ebay"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `images` | `string[]` | yes | 1–8 data URLs or http(s) image URLs |
| `notes` | `string` | no | Max 2000 chars |
| `conditionHint` | `ListingCondition \| null` | no | Seller override |
| `costBasis` | `number \| null` | no | USD cost for margin context |
| `targetMarketplace` | `"ebay"` | no | Default `ebay` |

#### Success response `200`

```json
{
  "data": {
    "title": "Nike Air Max 90 White Leather Men's Running Shoes Size 10",
    "titleCharacterCount": 58,
    "description": "...",
    "category": {
      "primary": "Men's Athletic Shoes",
      "path": ["Clothing, Shoes & Accessories", "Men", "Men's Shoes", "Athletic"],
      "ebayCategoryHint": "Clothing, Shoes & Accessories > Men > Men's Shoes > Athletic"
    },
    "itemSpecifics": [{ "name": "Brand", "value": "Nike" }],
    "keywords": ["nike air max 90", "mens sneakers"],
    "condition": "Pre-owned - Good",
    "brand": "Nike",
    "color": "White",
    "size": "10",
    "material": "Leather",
    "pricing": {
      "suggestedPrice": 79,
      "priceLow": 65,
      "priceHigh": 95,
      "currency": "USD",
      "rationale": "...",
      "confidence": 72
    },
    "confidenceScore": 78,
    "confidenceBreakdown": {
      "identification": 82,
      "titleSeo": 75,
      "specificsCompleteness": 80,
      "pricing": 70
    },
    "missingInformation": [],
    "detectedAttributes": {
      "itemType": "Athletic shoes",
      "style": "Air Max 90",
      "gender": "Men",
      "season": null,
      "pattern": null
    }
  },
  "error": null,
  "meta": {
    "model": "gpt-4o",
    "generatedAt": "2026-07-13T00:00:00.000Z",
    "phase": "1"
  }
}
```

#### Error response

```json
{
  "data": null,
  "error": { "code": "VALIDATION_ERROR", "message": "Upload at least one photo" },
  "meta": { "phase": "1" }
}
```

| Code | Status | Meaning |
|------|--------|---------|
| `VALIDATION_ERROR` | 400 | Bad payload |
| `INVALID_IMAGE` | 400 | Image not data/http URL |
| `PAYLOAD_TOO_LARGE` | 413 | Combined images too large |
| `CONFIG_ERROR` | 503 | Missing `OPENAI_API_KEY` |
| `GENERATION_FAILED` | 500 | Model/provider failure |

### `GET /api/generate-listing`

Returns endpoint documentation metadata (useful for health checks).
