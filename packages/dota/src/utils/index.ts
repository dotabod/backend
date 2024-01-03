export function steamID64toSteamID32(steamID64: string) {
  if (!steamID64) return null
  return Number(steamID64.substr(-16, 16)) - 6561197960265728
}

export function fmtMSS(totalSeconds: number) {
  // 👇️ get number of full minutes
  const minutes = Math.floor(totalSeconds / 60)

  // 👇️ get remainder of seconds
  const seconds = totalSeconds % 60

  function padTo2Digits(num: number) {
    return num.toString().padStart(2, '0')
  }

  // ✅ format as MM:SS
  return `${padTo2Digits(minutes)}:${padTo2Digits(seconds)}`
}
