/** Common eBay category paths used for suggestions and demo mode. */
export const EBAY_CATEGORY_HINTS: Array<{
  keywords: string[]
  name: string
  path: string
  ebayCategoryId: string
}> = [
  {
    keywords: ["sneaker", "shoe", "trainer", "jordan", "nike", "adidas", "yeezy"],
    name: "Athletic Shoes",
    path: "Clothing, Shoes & Accessories > Men > Men's Shoes > Athletic Shoes",
    ebayCategoryId: "15709",
  },
  {
    keywords: ["hoodie", "sweatshirt", "crewneck"],
    name: "Hoodies & Sweatshirts",
    path: "Clothing, Shoes & Accessories > Men > Men's Clothing > Hoodies & Sweatshirts",
    ebayCategoryId: "155183",
  },
  {
    keywords: ["jacket", "coat", "parka", "puffer"],
    name: "Coats & Jackets",
    path: "Clothing, Shoes & Accessories > Men > Men's Clothing > Coats & Jackets",
    ebayCategoryId: "57988",
  },
  {
    keywords: ["dress", "gown"],
    name: "Dresses",
    path: "Clothing, Shoes & Accessories > Women > Women's Clothing > Dresses",
    ebayCategoryId: "63861",
  },
  {
    keywords: ["handbag", "purse", "tote", "crossbody", "shoulder bag"],
    name: "Handbags",
    path: "Clothing, Shoes & Accessories > Women > Women's Bags & Handbags",
    ebayCategoryId: "169291",
  },
  {
    keywords: ["watch", "rolex", "seiko", "casio"],
    name: "Wristwatches",
    path: "Jewelry & Watches > Watches, Parts & Accessories > Wristwatches",
    ebayCategoryId: "313",
  },
  {
    keywords: ["jean", "denim", "levi"],
    name: "Jeans",
    path: "Clothing, Shoes & Accessories > Men > Men's Clothing > Jeans",
    ebayCategoryId: "11483",
  },
  {
    keywords: ["t-shirt", "tee", "shirt"],
    name: "T-Shirts",
    path: "Clothing, Shoes & Accessories > Men > Men's Clothing > Shirts > T-Shirts",
    ebayCategoryId: "15687",
  },
  {
    keywords: ["phone", "iphone", "samsung", "pixel", "galaxy"],
    name: "Cell Phones & Smartphones",
    path: "Cell Phones & Accessories > Cell Phones & Smartphones",
    ebayCategoryId: "9355",
  },
  {
    keywords: ["vintage", "antique", "collectible"],
    name: "Collectibles",
    path: "Collectibles",
    ebayCategoryId: "1",
  },
]

export function suggestCategoryFromText(text: string) {
  const hay = text.toLowerCase()
  for (const entry of EBAY_CATEGORY_HINTS) {
    if (entry.keywords.some((k) => hay.includes(k))) {
      return {
        name: entry.name,
        path: entry.path,
        ebayCategoryId: entry.ebayCategoryId,
      }
    }
  }
  return {
    name: "Clothing, Shoes & Accessories",
    path: "Clothing, Shoes & Accessories",
    ebayCategoryId: "11450",
  }
}
