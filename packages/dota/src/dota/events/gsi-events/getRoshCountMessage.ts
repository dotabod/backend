import { t } from 'i18next'

// Doing it this way so i18n can pick up the t('') strings

export function getRoshCountMessage(props: { lng: string; count: number }) {
  let roshCountMsg: string
  switch (props.count) {
    case 1:
      roshCountMsg = t('roshanCount.1', props)
      break
    case 2:
      roshCountMsg = t('roshanCount.2', props)
      break
    case 3:
      roshCountMsg = t('roshanCount.3', props)
      break
    default:
      roshCountMsg = t('roshanCount.more', { lng: props.lng, count: props.count })
      break
  }
  return roshCountMsg
}
