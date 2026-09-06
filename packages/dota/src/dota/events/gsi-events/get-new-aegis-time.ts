import type { AegisRes } from './aegis-res'

export const getNewAegisTime = function getNewAegisTime(res: AegisRes) {
  // calculate seconds delta between now and expireDate
  const newSeconds = Math.floor((new Date(res.expireDate).getTime() - Date.now()) / 1000)
  res.expireS = newSeconds > 0 ? newSeconds : 0

  return res
}
