import { t } from 'i18next'

import type { AegisRes } from './AegisRes'
import { getNewAegisTime } from './getNewAegisTime'

export function generateAegisMessage(res: AegisRes, lng: string) {
  res = getNewAegisTime(res)

  if (res.expireS <= 0) {
    return res.heroName
      ? t('aegis.expired', { emote: ':)', heroName: res.heroName, lng })
      : t('aegis.expiredUnknown', { emote: ':)', lng })
  }

  if (res.snatched) {
    return res.heroName
      ? t('aegis.snatched', { emote: 'PepeLaugh', heroName: res.heroName, lng })
      : t('aegis.snatchedUnknown', { lng })
  }

  return res.heroName
    ? t('aegis.pickup', { heroName: res.heroName, lng })
    : t('aegis.pickupUnknown', { lng })
}
