import { NextResponse } from "next/server"
import { ensureEbayUserAccessToken } from "@/lib/insights/ebay-auth"
import {
  conditionEnumForId,
  mapAiConditionToPolicy,
  type EbayPolicyCondition,
} from "@/lib/marketplaces/adapters/ebay/condition-map"
import { ebayMarketplaceId } from "@/lib/marketplaces/adapters/ebay/ebay-cache"
import { getItemConditionPoliciesForCategory } from "@/lib/marketplaces/adapters/ebay/metadata-conditions"
import { getEbayCategoryNode } from "@/lib/marketplaces/adapters/ebay/taxonomy"
import { getServerAuthUser } from "@/lib/supabase/index"

export const runtime = "nodejs"

/**
 * Load Metadata condition policies for a leaf category and map an AI condition
 * label onto a valid conditionId for that category only.
 *
 * POST { categoryId, aiCondition?, categoryPath? }
 */
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
      categoryId?: string
      aiCondition?: string
      categoryPath?: string
    }
    const categoryId = (body.categoryId || "").trim()
    if (!categoryId) {
      return NextResponse.json(
        { error: "categoryId is required." },
        { status: 400 }
      )
    }

    const marketplaceId = ebayMarketplaceId()
    const node = await getEbayCategoryNode(token.accessToken, categoryId)
    if (node && !node.leafCategory) {
      return NextResponse.json(
        {
          error:
            "Select a leaf (bottom-level) eBay category before choosing a condition.",
          code: "ebay_category_not_leaf",
          category: node,
        },
        { status: 400 }
      )
    }

    const policy = await getItemConditionPoliciesForCategory(
      token.accessToken,
      categoryId,
      marketplaceId
    )

    const mapped = mapAiConditionToPolicy(
      body.aiCondition,
      policy.conditions as EbayPolicyCondition[]
    )

    return NextResponse.json({
      marketplaceId,
      categoryId,
      categoryPath: body.categoryPath || node?.categoryPath || node?.categoryName,
      categoryName: node?.categoryName,
      leafCategory: node?.leafCategory ?? true,
      itemConditionRequired: policy.itemConditionRequired,
      conditions: policy.conditions.map((c) => ({
        ...c,
        conditionEnum: conditionEnumForId(c.conditionId),
      })),
      mappedCondition: mapped,
      validConditionIds: policy.conditions.map((c) => c.conditionId),
    })
  } catch (error) {
    console.error("[ebay/condition-policies]", error)
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load eBay condition policies.",
      },
      { status: 500 }
    )
  }
}
