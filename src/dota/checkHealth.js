export default function checkHealth(data, recentHealth) {
  if (!data?.hero?.health_percent) return false

  // console.log(recentHealth.reduce((a, b) => a + b, 0));
  const healthPct = data.hero.health_percent
  recentHealth.shift()
  recentHealth.push(healthPct)

  if (
    data.hero?.health - data.previously?.hero?.health > 200 &&
    Math.floor(Math.random() * 3) === 1 &&
    data.previously?.hero?.health !== 0 &&
    healthPct - data.previously?.hero?.health_percent > 5
  ) {
    return true
  }

  return false
}
