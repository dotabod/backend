import { Item, Packet } from '../../types.js'

export function findItem(itemName: string, searchStashAlso: boolean, data?: Packet) {
  if (!data?.items) return false

  // Should always be 17 unless they're not in a match
  if (Object.keys(data.items).length !== 17) return false

  // This checks backpack only, not fountain stash cause maybe courrier is bringing it
  const inv = Object.values(data.items)
  const item: Item | undefined = inv
    .slice(0, searchStashAlso ? 9 : 6)
    .find((item: Item) => item.name === itemName)

  // Doesn't have a midas
  if (!item) return false

  return item
}
