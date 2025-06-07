import * as fs from 'node:fs'
import axios from 'axios'

const dataset = [
  {
    steam32Id: 1234567890,
    mmr: 15300,
    rank: 1,
  },
]

interface OpenDotaResponse {
  region: {
    [key: string]: {
      games: number
      win: number
    }
  }
}

type RegionMapping = {
  [steam32Id: string]: number
}

const OPENDOTA_API_BASE = 'https://api.opendota.com/api'
const MAX_RETRIES = 5
const INITIAL_DELAY = 1000 // 1 second

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchWithBackoff(steam32Id: number, retryCount = 0): Promise<number | null> {
  try {
    const response = await axios.get<OpenDotaResponse>(
      `${OPENDOTA_API_BASE}/players/${steam32Id}/counts?limit=50`,
    )

    // Find region with most games
    let maxGames = 0
    let mostPlayedRegion = 0

    for (const [regionId, data] of Object.entries(response.data.region)) {
      if (data.games > maxGames) {
        maxGames = data.games
        mostPlayedRegion = Number.parseInt(regionId)
      }
    }

    return mostPlayedRegion
  } catch (error) {
    console.error(`Failed to fetch data for ${steam32Id}:`, error)
    if (retryCount < MAX_RETRIES) {
      const delay = INITIAL_DELAY * 2 ** retryCount
      console.log(`Retrying ${steam32Id} after ${delay}ms delay...`)
      await sleep(delay)
      return fetchWithBackoff(steam32Id, retryCount + 1)
    }
    console.error(`Failed to fetch data for ${steam32Id}:`, error)
    return null
  }
}
async function main() {
  try {
    // Read account IDs from the JSON file
    const accountIds = dataset.map((account) => account.steam32Id)
    let regionMapping: RegionMapping = {}
    let processed = 0
    const total = accountIds.length

    // Try to load existing mapping if it exists
    try {
      if (fs.existsSync('region-mapping.json')) {
        const existingData = fs.readFileSync('region-mapping.json', 'utf8')
        regionMapping = JSON.parse(existingData)
        console.log(`Loaded existing mapping with ${Object.keys(regionMapping).length} entries`)
      }
    } catch (readError) {
      console.error('Error reading existing mapping file:', readError)
    }

    for (const steam32Id of accountIds) {
      processed++
      console.log(`Processing ${processed}/${total}: ${steam32Id}`)

      // Skip if we already have this ID mapped
      if (regionMapping[steam32Id]) {
        console.log(`Skipping ${steam32Id} - already mapped to region ${regionMapping[steam32Id]}`)
        continue
      }

      const regionId = await fetchWithBackoff(steam32Id)
      if (regionId !== null) {
        regionMapping[steam32Id] = regionId

        // Save the mapping to a JSON file after each successful result
        fs.writeFileSync('region-mapping.json', JSON.stringify(regionMapping, null, 2))
        console.log(`Updated region-mapping.json with region ${regionId} for ${steam32Id}`)
      }

      // Add a small delay between requests to be nice to the API
      await sleep(100)
    }

    console.log('Processing complete! Results saved to region-mapping.json')
  } catch (error) {
    console.error('Error:', error)
  }
}

const regions = {
  '1': 'US WEST',
  '2': 'US EAST',
  '3': 'EUROPE',
  '5': 'SINGAPORE',
  '6': 'DUBAI',
  '7': 'AUSTRALIA',
  '8': 'STOCKHOLM',
  '9': 'AUSTRIA',
  '10': 'BRAZIL',
  '11': 'SOUTHAFRICA',
  '12': 'PW TELECOM SHANGHAI',
  '13': 'PW UNICOM',
  '14': 'CHILE',
  '15': 'PERU',
  '16': 'INDIA',
  '17': 'PW TELECOM GUANGDONG',
  '18': 'PW TELECOM ZHEJIANG',
  '19': 'JAPAN',
  '20': 'PW TELECOM WUHAN',
  '25': 'PW UNICOM TIANJIN',
  '37': 'TAIWAN',
  '38': 'ARGENTINA',
}

// update the dataset with the region for each account
function updateDataset(dataset: any[], regionMapping: RegionMapping) {
  // Filter out accounts with region 0
  const filteredDataset = dataset.filter((account) => {
    const regionId = regionMapping[account.steam32Id]
    return regionId !== 0
  })

  // Add region information to remaining accounts
  for (const account of filteredDataset) {
    const regionId = regionMapping[account.steam32Id]
    account.region = regions[regionId.toString() as keyof typeof regions]
    account.regionId = regionId
  }

  fs.writeFileSync('dataset-with-regions.json', JSON.stringify(filteredDataset, null, 2))
  return filteredDataset
}

// updateDataset(dataset, regionMapping)
// main()
