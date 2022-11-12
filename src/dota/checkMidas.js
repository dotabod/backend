export default function checkMidas(data, passiveMidas) {
  if (!data?.items) return false

  let ready = false

  for (const [slot, item] of Object.entries(data.items)) {
    // Skip if not midas
    if (item.name !== 'item_hand_of_midas') {
      continue
    }
    // Skip stash/if midas is on cooldown
    if (!slot.startsWith('slot') || item.cooldown > 0) {
      passiveMidas = 0
      continue
    }

    if (passiveMidas == 25) {
      console.log('Midas is ready to be used!')
      passiveMidas = -50
      ready = true
    }
    passiveMidas += 1
  }

  return ready
}
