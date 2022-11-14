export function steamID64toSteamID32(steamID64: string) {
  return Number(steamID64.substr(-16, 16)) - 6561197960265728
}

export function fmtMSS(s: number) {
  return (s - (s %= 60)) / 60 + (s > 9 ? ':' : ':0') + s
}
