import { Elysia } from 'elysia'

import { getProfanityDetails, moderateText } from './utils/moderation'

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
  .post('/moderate', async ({ body }) => {
    const { text } = body as { text: string | string[] }

    if (!text) {
      return {
        error: 'Missing text parameter',
      }
    }
    try {
      let moderatedText: string | string[] | undefined

      if (Array.isArray(text)) {
        moderatedText = await moderateText(text)
        // Handle array input
        return {
          containsProfanity: (moderatedText as string[]).some(
            (moderated, index) => moderated !== text[index]
          ),
          moderated: moderatedText,
          original: text,
        }
      }

      moderatedText = await moderateText(text)

      // Handle single string input
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
  })
  .post('/check', ({ body }) => {
    const { text } = body as { text: string | string[] }

    if (!text) {
      return {
        error: 'Missing text parameter',
      }
    }

    try {
      const details = getProfanityDetails(text)

      if (Array.isArray(text)) {
        // Handle array input
        return {
          containsProfanity: (details as { isFlagged: boolean }[]).some((item) => item.isFlagged),
          details,
          original: text,
        }
      }

      // Handle single string input
      return {
        containsProfanity: (details as { isFlagged: boolean }).isFlagged,
        details,
        original: text,
      }
    } catch (error) {
      return {
        error: 'Error checking text',
        message: error instanceof Error ? error.message : String(error),
      }
    }
  })

// Start the server
const port = process.env.PORT ? Number.parseInt(process.env.PORT, 10) : 3000
app.listen(port)

console.log(`🚀 Profanity Filter API running at http://localhost:${port}`)

export default app
