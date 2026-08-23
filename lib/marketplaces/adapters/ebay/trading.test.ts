import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  classifyGetItemDetailStatus,
  parseItemSpecifics,
  parsePictureUrls,
  parseTradingGetItemXml,
  xmlText,
  buildReviseItemClearSkuXml,
} from "@/lib/marketplaces/adapters/ebay/trading-parse"

describe("Trading GetItem XML parsing", () => {
  const sampleXml = `<?xml version="1.0" encoding="utf-8"?>
<GetItemResponse xmlns="urn:ebay:apis:eBLBaseComponents">
  <Ack>Success</Ack>
  <Item>
    <ItemID>111222333444</ItemID>
    <Title>Vintage Red Tee</Title>
    <SKU>SKU-RED-1</SKU>
    <Description><![CDATA[<p>Soft cotton tee with pocket.</p>]]></Description>
    <PrimaryCategory>
      <CategoryID>15724</CategoryID>
      <CategoryName>T-Shirts</CategoryName>
    </PrimaryCategory>
    <ConditionID>3000</ConditionID>
    <ConditionDisplayName>Used</ConditionDisplayName>
    <ConditionDescription>Light wear on hem</ConditionDescription>
    <Quantity>3</Quantity>
    <ListingType>FixedPriceItem</ListingType>
    <ListingDetails>
      <StartTime>2026-01-01T12:00:00.000Z</StartTime>
      <EndTime>2026-07-01T12:00:00.000Z</EndTime>
    </ListingDetails>
    <SellingStatus>
      <CurrentPrice currencyID="USD">24.50</CurrentPrice>
      <QuantitySold>1</QuantitySold>
      <ListingStatus>Active</ListingStatus>
    </SellingStatus>
    <ShippingDetails>
      <ShippingType>Flat</ShippingType>
      <ShippingServiceOptions>
        <ShippingService>USPSPriority</ShippingService>
        <ShippingServiceCost currencyID="USD">5.99</ShippingServiceCost>
      </ShippingServiceOptions>
    </ShippingDetails>
    <PictureDetails>
      <GalleryURL>https://i.ebayimg.com/images/g/cover/s-l140.jpg</GalleryURL>
      <PictureURL>https://i.ebayimg.com/images/g/a/s-l1600.jpg</PictureURL>
      <PictureURL>https://i.ebayimg.com/images/g/b/s-l1600.jpg</PictureURL>
      <PictureURL>https://i.ebayimg.com/images/g/c/s-l1600.jpg</PictureURL>
    </PictureDetails>
    <ItemSpecifics>
      <NameValueList><Name>Brand</Name><Value>Nike</Value></NameValueList>
      <NameValueList><Name>Size</Name><Value>M</Value></NameValueList>
      <NameValueList><Name>Color</Name><Value>Red</Value></NameValueList>
      <NameValueList><Name>Material</Name><Value>Cotton</Value></NameValueList>
      <NameValueList><Name>Style</Name><Value>Crew Neck</Value></NameValueList>
      <NameValueList><Name>Pattern</Name><Value>Solid</Value></NameValueList>
      <NameValueList><Name>Gender</Name><Value>Men</Value></NameValueList>
      <NameValueList><Name>Department</Name><Value>Men</Value></NameValueList>
      <NameValueList><Name>Type</Name><Value>T-Shirt</Value></NameValueList>
    </ItemSpecifics>
  </Item>
</GetItemResponse>`

  it("extracts ItemID and Title from ActiveList Item blocks", () => {
    const xml = `
      <GetMyeBaySellingResponse>
        <Ack>Success</Ack>
        <ActiveList>
          <PaginationResult><TotalNumberOfEntries>2</TotalNumberOfEntries></PaginationResult>
          <ItemArray>
            <Item>
              <ItemID>111222333444</ItemID>
              <Title>Vintage Red Tee</Title>
              <SKU>SKU-1</SKU>
              <QuantityAvailable>2</QuantityAvailable>
              <SellingStatus><CurrentPrice currencyID="USD">12.50</CurrentPrice></SellingStatus>
            </Item>
            <Item>
              <ItemID>555666777888</ItemID>
              <Title>Blue Jacket</Title>
            </Item>
          </ItemArray>
        </ActiveList>
      </GetMyeBaySellingResponse>`

    const active = xml.match(/<ActiveList[\s\S]*?<\/ActiveList>/i)?.[0] || ""
    const items = [...active.matchAll(/<Item>([\s\S]*?)<\/Item>/gi)].map(
      (m) => m[1]
    )
    assert.equal(items.length, 2)
    assert.equal(xmlText(items[0], "ItemID"), "111222333444")
    assert.equal(xmlText(items[0], "Title"), "Vintage Red Tee")
    assert.equal(xmlText(items[1], "ItemID"), "555666777888")
    assert.equal(
      xmlText(
        active.match(/<PaginationResult[\s\S]*?<\/PaginationResult>/i)?.[0] ||
          "",
        "TotalNumberOfEntries"
      ),
      "2"
    )
  })

  it("parses all PictureURL values in original order", () => {
    const urls = parsePictureUrls(sampleXml)
    assert.deepEqual(urls, [
      "https://i.ebayimg.com/images/g/a/s-l1600.jpg",
      "https://i.ebayimg.com/images/g/b/s-l1600.jpg",
      "https://i.ebayimg.com/images/g/c/s-l1600.jpg",
    ])
  })

  it("parses item specifics including brand size color", () => {
    const specifics = parseItemSpecifics(sampleXml)
    assert.equal(specifics.Brand, "Nike")
    assert.equal(specifics.Size, "M")
    assert.equal(specifics.Color, "Red")
    assert.equal(specifics.Type, "T-Shirt")
    assert.equal(specifics.Department, "Men")
  })

  it("parses full GetItem payload fields", () => {
    const detail = parseTradingGetItemXml(sampleXml)
    assert.equal(detail.ebayListingId, "111222333444")
    assert.equal(detail.title, "Vintage Red Tee")
    assert.match(detail.description, /Soft cotton tee/)
    assert.equal(detail.sku, "SKU-RED-1")
    assert.equal(detail.price, 24.5)
    assert.equal(detail.currency, "USD")
    assert.equal(detail.quantity, 2)
    assert.equal(detail.categoryId, "15724")
    assert.equal(detail.categoryName, "T-Shirts")
    assert.equal(detail.conditionId, "3000")
    assert.equal(detail.conditionDisplayName, "Used")
    assert.equal(detail.conditionDescription, "Light wear on hem")
    assert.equal(detail.listingFormat, "FixedPriceItem")
    assert.equal(detail.shippingType, "Flat")
    assert.equal(detail.shippingCost, "5.99")
    assert.equal(detail.shippingService, "USPSPriority")
    assert.equal(detail.imageUrls.length, 3)
    assert.equal(classifyGetItemDetailStatus(detail), "full")
  })
})

describe("ReviseItem Custom Label clear", () => {
  it("deletes Item.SKU without removing the listing", () => {
    const xml = buildReviseItemClearSkuXml("111222333444")
    assert.match(xml, /<ItemID>111222333444<\/ItemID>/)
    assert.match(xml, /<DeletedField>Item\.SKU<\/DeletedField>/)
    assert.doesNotMatch(xml, /<SKU>/)
  })

  it("escapes XML in the item id", () => {
    const xml = buildReviseItemClearSkuXml("<oops>")
    assert.match(xml, /<ItemID>&lt;oops&gt;<\/ItemID>/)
  })
})
