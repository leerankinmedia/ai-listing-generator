import { NextResponse } from "next/server"
import { ensureEbayUserAccessToken } from "@/lib/insights/ebay-auth"
import {
  buildCategorySuggestionQuery,
  getEbayCategoryChildren,
  getEbayCategorySuggestions,
  getEbayDefaultCategoryTreeId,
} from "@/lib/marketplaces/adapters/ebay/taxonomy"
import { ebayMarketplaceId } from "@/lib/marketplaces/adapters/ebay/ebay-cache"
import { getServerAuthUser } from "@/lib/supabase/index"

export const runtime = "nodejs"

/**
 * Browse / search the live eBay US category tree.
 *
 * GET ?mode=roots
 * GET ?mode=children&categoryId=
 * GET ?mode=suggest&q=
 * POST { mode: "suggest", title, itemType, department, brand, keywords }
 */
export async function GET(request: Request) {
  try {
    const user = await getServerAuthUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
    }

    const token = await ensureEbayUserAccessToken()
    if (!token.ok) {
      return NextResponse.json(
        { error: token.reason, code: "ebay_not_connected" },
        { status: 400 }
      )
    }

    const url = new URL(request.url)
    const mode = (url.searchParams.get("mode") || "roots").trim()
    const marketplaceId = ebayMarketplaceId()

    if (mode === "roots" || mode === "children") {
      const categoryId = url.searchParams.get("categoryId") || undefined
      const tree = await getEbayDefaultCategoryTreeId(
        token.accessToken,
        marketplaceId
      )
      const children = await getEbayCategoryChildren(token.accessToken, {
        categoryId,
        categoryTreeId: tree.categoryTreeId,
        marketplaceId,
      })
      return NextResponse.json(children)
    }

    if (mode === "suggest" || mode === "search") {
      const q = (url.searchParams.get("q") || "").trim()
      if (!q) {
        return NextResponse.json(
          { error: "Query q is required." },
          { status: 400 }
        )
      }
      const suggestions = await getEbayCategorySuggestions(
        token.accessToken,
        q,
        { marketplaceId, limit: 12 }
      )
      return NextResponse.json(suggestions)
    }

    return NextResponse.json({ error: "Unknown mode." }, { status: 400 })
  } catch (error) {
    console.error("[ebay/categories]", error)
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load eBay categories.",
      },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const user = await getServerAuthUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
    }

    const token = await ensureEbayUserAccessToken()
    if (!token.ok) {
      return NextResponse.json(
        { error: token.reason, code: "ebay_not_connected" },
        { status: 400 }
      )
    }

    const body = (await request.json()) as {
      mode?: string
      title?: string
      itemType?: string
      department?: string
      brand?: string
      keywords?: string[] | string
      categoryHint?: string
      q?: string
      limit?: number
    }

    const marketplaceId = ebayMarketplaceId()
    const q =
      (body.q || "").trim() ||
      buildCategorySuggestionQuery({
        title: body.title,
        itemType: body.itemType,
        department: body.department,
        brand: body.brand,
        keywords: body.keywords,
        categoryHint: body.categoryHint,
      })

    if (!q) {
      return NextResponse.json(
        { error: "Provide a title or search query for category suggestions." },
        { status: 400 }
      )
    }

    const suggestions = await getEbayCategorySuggestions(
      token.accessToken,
      q,
      { marketplaceId, limit: body.limit ?? 8 }
    )
    return NextResponse.json(suggestions)
  } catch (error) {
    console.error("[ebay/categories]", error)
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to suggest eBay categories.",
      },
      { status: 500 }
    )
  }
}
