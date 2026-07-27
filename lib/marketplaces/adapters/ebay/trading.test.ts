import assert from "node:assert/strict"
import { describe, it } from "node:test"

// Lightweight XML extraction mirrors trading.ts helpers for unit coverage
// without hitting the network.
function xmlText(block: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i")
  const m = block.match(re)
  return m?.[1]?.trim() || ""
}

describe("Trading ActiveList XML parsing", () => {
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
})
