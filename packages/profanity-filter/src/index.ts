import { Elysia } from 'elysia'
import { moderateText, getProfanityDetails } from './utils/moderation.js'

// Create Elysia app
const app = new Elysia()
  .get('/', () => {
    return {
      name: 'Profanity Filter API',
      version: '1.0.0',
      description: 'Multilingual profanity detection and filtering API',
      endpoints: [
        {
          path: '/moderate',
          method: 'POST',
          description: 'Moderate text for profanity',
          body: { text: 'string or string[]' },
        },
        {
          path: '/check',
          method: 'POST',
          description: 'Check text for profanity and get detailed information',
          body: { text: 'string or string[]' },
        },
      ],
    }
  })
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
          original: text,
          moderated: moderatedText,
          containsProfanity: (moderatedText as string[]).some(
            (moderated, index) => moderated !== text[index],
          ),
        }
      }

      moderatedText = await moderateText(text)

      // Handle single string input
      return {
        original: text,
        moderated: moderatedText,
        containsProfanity: moderatedText !== text,
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
          original: text,
          containsProfanity: (details as Array<{ isFlagged: boolean }>).some(
            (item) => item.isFlagged,
          ),
          details,
        }
      }

      // Handle single string input
      return {
        original: text,
        containsProfanity: (details as { isFlagged: boolean }).isFlagged,
        details,
      }
    } catch (error) {
      return {
        error: 'Error checking text',
        message: error instanceof Error ? error.message : String(error),
      }
    }
  })

// Start the server
const port = process.env.PORT ? Number.parseInt(process.env.PORT) : 3000
app.listen(port)

console.log(`🚀 Profanity Filter API running at http://localhost:${port}`)

export default app
