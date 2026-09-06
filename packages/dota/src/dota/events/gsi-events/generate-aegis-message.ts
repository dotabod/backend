import { t } from 'i18next'

import type { AegisRes } from './aegis-res'
import { getNewAegisTime } from './get-new-aegis-time'

export const generateAegisMessage = function generateAegisMessage(res: AegisRes, lng: string) {
  res = getNewAegisTime(res)
  const hasHeroName = res.heroName !== null && res.heroName !== undefined && res.heroName.length > 0

  if (res.expireS <= 0) {
    return hasHeroName
      ? t('aegis.expired', { emote: ':)', heroName: res.heroName, lng })
      : t('aegis.expiredUnknown', { emote: ':)', lng })
  }

  if (res.snatched) {
    return hasHeroName
      ? t('aegis.snatched', { emote: 'PepeLaugh', heroName: res.heroName, lng })
      : t('aegis.snatchedUnknown', { lng })
  }

  return hasHeroName
    ? t('aegis.pickup', { heroName: res.heroName, lng })
    : t('aegis.pickupUnknown', { lng })
}
