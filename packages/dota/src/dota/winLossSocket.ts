export const WIN_LOSS_PREVIEW_CLIENT_TYPE = 'win-loss'
export const WIN_LOSS_PROFILE_CLIENT_TYPE = 'profile-wl'

export function getWinLossRoom(twitchId: string): string {
  return `profile-wl:${twitchId}`
}
