import { t } from 'i18next'
import type { AegisRes } from './AegisRes.js'
import { getNewAegisTime } from './getNewAegisTime.js'

export function generateAegisMessage(res: AegisRes, lng: string) {
  res = getNewAegisTime(res)

  if (res.expireS <= 0) {
    return t('aegis.expired', { emote: ':)', lng, heroName: res.heroName })
  }

  if (res.snatched) {
    return t('aegis.snatched', { emote: 'PepeLaugh', lng, heroName: res.heroName })
  }

  return t('aegis.pickup', { lng, heroName: res.heroName })
}
