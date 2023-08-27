import retry from 'retry'

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

export const retryCustom = async <T>({
  retries,
  fn,
  minTimeout,
}: {
  retries: number
  fn: () => Promise<T>
  minTimeout: number
}): Promise<T> => {
  const operation = retry.operation({
    retries,
    minTimeout,
  })

  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    operation.attempt(async (currentAttempt) => {
      console.log({ currentAttempt })
      try {
        const result = await fn()
        resolve(result)
      } catch (err: any) {
        if (!operation.retry(new Error('retrying'))) {
          reject(operation.mainError())
        }
      }
    })
  })
}
