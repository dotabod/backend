import { Elysia, t } from 'elysia'

import { getProfanityDetails, moderateText } from './utils/moderation'

const textRequestSchema = t.Object({
  text: t.Union([t.String(), t.Array(t.String())]),
})

// Create Elysia app
const app = new Elysia()
  .get('/', () => ({
    description: 'Multilingual profanity detection and filtering API',
    endpoints: [
      {
        body: { text: 'string or string[]' },
        description: 'Moderate text for profanity',
        method: 'POST',
        path: '/moderate',
      },
      {
        body: { text: 'string or string[]' },
        description: 'Check text for profanity and get detailed information',
        method: 'POST',
        path: '/check',
      },
    ],
    name: 'Profanity Filter API',
    version: '1.0.0',
  }))
  .post(
    '/moderate',
    async ({ body }) => {
      const { text } = body

      if (text.length === 0) {
        return {
          error: 'Missing text parameter',
        }
      }
      try {
        if (Array.isArray(text)) {
          const moderatedText = (await moderateText(text)) ?? text
          return {
            containsProfanity: moderatedText.some((moderated, index) => moderated !== text[index]),
            moderated: moderatedText,
            original: text,
          }
        }

        const moderatedText = await moderateText(text)
        return {
          containsProfanity: moderatedText !== text,
          moderated: moderatedText,
          original: text,
        }
      } catch (error) {
        return {
          error: 'Error moderating text',
          message: error instanceof Error ? error.message : String(error),
        }
      }
    },
    { body: textRequestSchema }
  )
  .post(
    '/check',
    ({ body }) => {
      const { text } = body

      if (text.length === 0) {
        return {
          error: 'Missing text parameter',
        }
      }

      try {
        if (Array.isArray(text)) {
          const details = getProfanityDetails(text)
          return {
            containsProfanity: details.some((item) => item.isFlagged),
            details,
            original: text,
          }
        }

        const details = getProfanityDetails(text)
        return {
          containsProfanity: details.isFlagged,
          details,
          original: text,
        }
      } catch (error) {
        return {
          error: 'Error checking text',
          message: error instanceof Error ? error.message : String(error),
        }
      }
    },
    { body: textRequestSchema }
  )

// Start the server
const port =
  process.env.PORT !== undefined && process.env.PORT.length > 0
    ? Math.trunc(Number(process.env.PORT))
    : 3000
app.listen(port)

console.log(`🚀 Profanity Filter API running at http://localhost:${port}`)

export default app
