import retry from 'retry'

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
