import type { Item, Packet } from '../../types.js'

export function findItem({
  itemName,
  searchStashAlso,
  data,
}: {
  itemName: string | string[]
  searchStashAlso?: boolean
  data?: Packet
}) {
  if (!data?.items) return false

  // Should always be 17 unless they're not in a match
  if (Object.keys(data.items).length !== 17) return false

  const itemNames = Array.isArray(itemName) ? itemName : [itemName]

  // This checks backpack only, not fountain stash cause maybe courrier is bringing it
  const inv = Object.values(data.items)

  const items: Item[] = inv
    .slice(0, searchStashAlso ? 9 : 6)
    .filter((item: Item) => itemNames.includes(item.name))

  // Doesn't have this item
  if (!items.length) return false

  return items
}
