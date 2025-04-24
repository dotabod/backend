import { logger } from '@dotabod/shared-utils'

// Twitch GQL constants
const GQL_URL = 'https://gql.twitch.tv/gql'
const GQL_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko' // Public web client ID
const DELETE_CLIP_HASH = 'df142a7eec57c5260d274b92abddb0bd1229dc538341434c90367cf1f22d71c4'

// Define a simple type for the expected GQL response structure
type GqlDeleteResponse = [
  {
    data?: {
      deleteClips?: {
        __typename?: string
      }
    }
    errors?: {
      message: string
    }[]
  }?,
]

/**
 * Deletes a batch of Twitch clips for a specific user using the internal GQL endpoint.
 * WARNING: Uses an undocumented API that may change without notice.
 */
export async function deleteClipsBatch(
  clipSlugs: string[],
  authToken: string,
  logContext: object,
): Promise<void> {
  if (clipSlugs.length === 0) {
    return // Nothing to delete
  }

  const gqlPayload = [
    {
      operationName: 'Clips_DeleteClips',
      variables: { input: { slugs: clipSlugs } }, // Use the array of slugs
      extensions: { persistedQuery: { version: 1, sha256Hash: DELETE_CLIP_HASH } },
    },
  ]

  const headers = {
    'Client-ID': GQL_CLIENT_ID,
    Authorization: `OAuth ${authToken}`,
    'Content-Type': 'application/json',
    Accept: '*/*',
  }

  try {
    const response = await fetch(GQL_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(gqlPayload),
    })

    if (!response.ok) {
      const errorBody = await response.text()
      throw new Error(
        `GQL delete batch failed: ${response.status} ${response.statusText} - ${errorBody}`,
      )
    }

    const result = (await response.json()) as GqlDeleteResponse // Assert type

    if (result[0]?.errors?.[0]?.message) {
      logger.error('GQL delete batch returned error', {
        ...logContext,
        slugsCount: clipSlugs.length,
        error: result[0].errors[0].message,
      })
      return // Don't throw, just log the error
    }

    // Check for expected success payload structure
    if (result[0]?.data?.deleteClips?.__typename === 'DeleteClipsPayload') {
      logger.info('Successfully deleted clip batch via GQL', {
        ...logContext,
        count: clipSlugs.length,
      })
    } else {
      logger.warn('GQL delete batch response format unexpected', {
        ...logContext,
        slugsCount: clipSlugs.length,
        response: result,
      })
    }
  } catch (error: any) {
    logger.error('Error deleting clip batch via GQL', {
      ...logContext,
      slugsCount: clipSlugs.length,
      error: error.message,
    })
  }
}
