import axios from 'axios'
import { t } from 'i18next'

import { logger } from '@dotabod/shared-utils'
import { gsiHandlers } from './lib/consts.js'
import { say } from './say.js'

// Store the latest patch info so we can compare with new checks
let latestPatchInfo: { version: string; timestamp: number } | null = null
// Store the last check timestamp
let lastCheckTimestamp = 0

// API endpoints for Dota 2 patch notes
const DOTA_PATCH_LIST_URL = 'https://www.dota2.com/datafeed/patchnoteslist?language=english'
const DOTA_PATCH_DETAILS_URL =
  'https://www.dota2.com/datafeed/patchnotes?version={version}&language=english'

/**
 * Check for new Dota 2 patches using the official API
 */
async function checkForNewDotaPatch(): Promise<{ isNewPatch: boolean; version: string | null }> {
  try {
    // Get the list of patches
    const response = await axios.get(DOTA_PATCH_LIST_URL)

    if (!response.data || !response.data.patches || !response.data.patches.length) {
      logger.warn('[DotaPatchChecker] No patch data found in API response')
      return { isNewPatch: false, version: null }
    }

    // Get the latest patch from the sorted list (patches are sorted with oldest first, newest last)
    const patches = response.data.patches
    const latestPatch = patches[patches.length - 1]
    const currentVersion = latestPatch.patch_name
    const currentTimestamp = latestPatch.patch_timestamp

    // Current timestamp for logging
    const now = Math.floor(Date.now() / 1000)

    // If this is the first time checking or after a reboot
    if (latestPatchInfo === null) {
      logger.info(
        `[DotaPatchChecker] Initial patch version: ${currentVersion} (timestamp: ${currentTimestamp})`,
      )
      latestPatchInfo = { version: currentVersion, timestamp: currentTimestamp }
      lastCheckTimestamp = now
      return { isNewPatch: false, version: currentVersion }
    }

    // Get current time
    const timeSinceLastCheck = now - lastCheckTimestamp
    lastCheckTimestamp = now

    // Check if there's a new patch by comparing timestamps
    // A patch is new if it's newer than our last known patch AND it was published after our last check
    const isNew =
      currentTimestamp > latestPatchInfo.timestamp &&
      currentTimestamp > lastCheckTimestamp - timeSinceLastCheck

    if (isNew) {
      logger.info(
        `[DotaPatchChecker] New patch detected: ${currentVersion} (timestamp: ${currentTimestamp}, previous: ${latestPatchInfo.version})`,
      )
      latestPatchInfo = { version: currentVersion, timestamp: currentTimestamp }
      return { isNewPatch: true, version: currentVersion }
    }

    return { isNewPatch: false, version: currentVersion }
  } catch (error) {
    logger.error('[DotaPatchChecker] Error checking for new Dota 2 patch:', { error })
    return { isNewPatch: false, version: null }
  }
}

/**
 * Get detailed information for a specific patch version
 */
export async function getPatchDetails(version: string): Promise<any | null> {
  try {
    const url = DOTA_PATCH_DETAILS_URL.replace('{version}', version)
    const response = await axios.get(url)

    if (!response.data || response.data.success === false) {
      logger.warn(`[DotaPatchChecker] Could not get details for patch ${version}`)
      return null
    }

    return response.data
  } catch (error) {
    logger.error(`[DotaPatchChecker] Error getting details for patch ${version}:`, { error })
    return null
  }
}

/**
 * Notify all connected and online clients about a new Dota 2 patch
 */
function notifyClientsAboutNewPatch(version: string): void {
  // Iterate through all connected clients
  for (const [token, handler] of gsiHandlers.entries()) {
    if (handler && !handler.disabled && handler.client.stream_online) {
      say(
        handler.client,
        t('dotapatch.newPatch', {
          emote: 'PogChamp',
          version,
          lng: handler.client.locale,
        }),
        {
          chattersKey: 'dotapatch',
        },
      )
    }
  }
}

/**
 * Initialize the Dota patch checker service
 * @param checkIntervalMinutes How often to check for new patches (in minutes)
 */
export function initDotaPatchChecker(checkIntervalMinutes = 30): void {
  // Store the current time as the initialization time
  lastCheckTimestamp = Math.floor(Date.now() / 1000)

  // Do an initial check to get the current version without notifying
  checkForNewDotaPatch().catch((error) => {
    logger.error('[DotaPatchChecker] Error during initial patch check:', { error })
  })

  // Set up a repeating timer to check for new patches
  const checkIntervalMs = checkIntervalMinutes * 60 * 1000
  setInterval(async () => {
    try {
      const { isNewPatch, version } = await checkForNewDotaPatch()

      if (isNewPatch && version) {
        // Notify all connected clients about the new patch
        notifyClientsAboutNewPatch(version)
      }
    } catch (error) {
      logger.error('[DotaPatchChecker] Error in patch check interval:', { error })
    }
  }, checkIntervalMs)

  logger.info(`[DotaPatchChecker] Initialized, checking every ${checkIntervalMinutes} minutes`)
}
