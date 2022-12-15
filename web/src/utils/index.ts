import CustomError from './customError.js'

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

export const wait = (time: number) => new Promise((resolve) => setTimeout(resolve, time || 0))
export const retry = (cont: number, fn: () => Promise<any>, delay: number): Promise<any> =>
  fn().catch((err) =>
    cont > 0 ? wait(delay).then(() => retry(cont - 1, fn, delay)) : Promise.reject(err),
  )

export const promiseTimeout = (promise: Promise<any>, ms: number, reason: string) =>
  new Promise((resolve, reject) => {
    let timeoutCleared = false
    const timeoutId = setTimeout(() => {
      timeoutCleared = true
      reject(new CustomError(reason))
    }, ms)
    promise
      .then((result) => {
        if (!timeoutCleared) {
          clearTimeout(timeoutId)
          resolve(result)
        }
      })
      .catch((err) => {
        if (!timeoutCleared) {
          clearTimeout(timeoutId)
          reject(err)
        }
      })
  })
