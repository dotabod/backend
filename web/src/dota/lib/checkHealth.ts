import { logger } from "../../utils/logger.js";

export default function checkHealth(
  data: {
    hero: { health_percent: number; health: number }
    previously: { hero: { health: number; health_percent: number } }
  },
  recentHealth: number[],
) {
  if (!data.hero.health_percent) return false

  const healthPct = data.hero.health_percent
  recentHealth.shift()
  recentHealth.push(healthPct)
  logger.info('[HEALTH]', recentHealth)

  const randomNumber = Math.floor(Math.random() * 3) === 1

  if (
    data.hero.health - data.previously.hero.health > 200 &&
    randomNumber &&
    data.previously.hero.health !== 0 &&
    healthPct - data.previously.hero.health_percent > 5
  ) {
    return true
  }

  return false
}
