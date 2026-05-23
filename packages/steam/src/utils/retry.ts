import retry from 'retry'

export const retryCustom = async <T>(fn: () => Promise<T>): Promise<T> => {
  const operation = retry.operation({
    factor: 1,
    retries: 10,
    minTimeout: 1_000,
    maxTimeout: 10_000,
  })

  return new Promise((resolve, reject) => {
    operation.attempt(async () => {
      try {
        const result = await fn()
        resolve(result)
      } catch {
        if (!operation.retry(new Error('retrying'))) {
          reject(operation.mainError())
        }
      }
    })
  })
}
