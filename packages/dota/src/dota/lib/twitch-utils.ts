import { logger } from '@dotabod/shared-utils'

// Twitch GQL constants
const GQL_URL = 'https://gql.twitch.tv/gql'
// Public web client ID
const GQL_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko'
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

export const deleteClipsBatch = async function deleteClipsBatch(
  clipSlugs: string[],
  authToken: string,
  logContext: object
): Promise<void> {
  if (clipSlugs.length === 0) {
    // Nothing to delete
    return
  }

  const gqlPayload = [
    {
      extensions: { persistedQuery: { sha256Hash: DELETE_CLIP_HASH, version: 1 } },
      operationName: 'Clips_DeleteClips',
      // Use the array of slugs,
      variables: { input: { slugs: clipSlugs } },
    },
  ]

  const headers = {
    Accept: '*/*',
    Authorization: `OAuth ${authToken}`,
    'Client-ID': GQL_CLIENT_ID,
    'Content-Type': 'application/json',
  }

  try {
    const response = await fetch(GQL_URL, {
      body: JSON.stringify(gqlPayload),
      headers,
      method: 'POST',
    })

    if (!response.ok) {
      const errorBody = await response.text()
      throw new Error(
        `GQL delete batch failed: ${response.status} ${response.statusText} - ${errorBody}`
      )
    }

    // Assert type
    const result = (await response.json()) as GqlDeleteResponse

    if (result[0]?.errors?.[0]?.message !== undefined && result[0].errors[0].message.length > 0) {
      logger.error('GQL delete batch returned error', {
        ...logContext,
        error: result[0].errors[0].message,
        slugsCount: clipSlugs.length,
      })
      // Don't throw, just log the error
      return
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
        response: result,
        slugsCount: clipSlugs.length,
      })
    }
  } catch (error) {
    logger.error('Error deleting clip batch via GQL', {
      ...logContext,
      error: (error as Error).message,
      slugsCount: clipSlugs.length,
    })
  }
}
