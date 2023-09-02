import { twitchChatSpy } from '../../../../__tests__/utils.js'

export async function checkCallAndMemory(regexPattern: RegExp, userCount: number) {
  return new Promise<void>((resolve, reject) => {
    let prevCallCount = 0
    let consecutiveSameCount = 0
    const interval = setInterval(() => {
      const callLength = twitchChatSpy.mock.calls.filter(([, message]) =>
        message.match(regexPattern),
      ).length
      const { rss } = process.memoryUsage()
      const mb = rss / 1000000

      if (callLength === userCount && mb < 400) {
        clearInterval(interval)
        resolve()
      } else if (prevCallCount === callLength) {
        consecutiveSameCount++
        if (consecutiveSameCount > 2) {
          clearInterval(interval)
          reject(
            `call count ${userCount} ${callLength} ${twitchChatSpy.mock.calls.length} and mb use ${mb}`,
          )
        }
      } else {
        consecutiveSameCount = 0
      }

      prevCallCount = callLength
    }, 1000)
  })
}
