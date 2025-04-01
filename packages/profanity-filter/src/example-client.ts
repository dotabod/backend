/**
 * Example Client for Profanity Filter API
 *
 * This script demonstrates how to use the Profanity Filter API
 * Run with: bun run src/example-client.ts
 */

import axios from 'axios'

const API_URL = 'http://localhost:3000'

// Test cases to check
const testCases = [
  { text: 'Hello world, this is a normal text.', description: 'Normal text' },
  { text: 'f*u*c*k', description: 'Starred profanity' },
  { text: 'сука блять', description: 'Russian profanity' },
  { text: 'пидор', description: 'Russian profanity 2' },
  { text: 'пидop', description: 'Mixed Latin-Cyrillic Russian profanity' },
  { text: '操你妈', description: 'Chinese profanity' },
  { text: 'hijo de puta', description: 'Spanish profanity' },
  { text: 'scheiße', description: 'German profanity' },
]

async function testAPI() {
  console.log('Testing Profanity Filter API...\n')

  // Check API info
  try {
    const response = await axios.get(API_URL)
    console.log('API Info:')
    console.log(response.data)
    console.log('-------------------\n')
  } catch (error) {
    console.error('Error connecting to API. Is the server running?')
    process.exit(1)
  }

  // Test moderation endpoint
  console.log('Testing /moderate endpoint:')
  for (const testCase of testCases) {
    try {
      const response = await axios.post(`${API_URL}/moderate`, {
        text: testCase.text,
      })

      console.log(`\nInput (${testCase.description}): "${testCase.text}"`)
      console.log(`Moderated: "${response.data.moderated}"`)
      console.log(`Contains profanity: ${response.data.containsProfanity}`)
    } catch (error) {
      console.error(`Error testing "${testCase.text}":`, error)
    }
  }

  console.log('\n-------------------\n')

  // Test check endpoint
  console.log('Testing /check endpoint:')
  for (const testCase of testCases) {
    try {
      const response = await axios.post(`${API_URL}/check`, {
        text: testCase.text,
      })

      console.log(`\nInput (${testCase.description}): "${testCase.text}"`)
      console.log(`Contains profanity: ${response.data.containsProfanity}`)
      if (response.data.details.isFlagged) {
        console.log(`Source: ${response.data.details.source}`)
        if (response.data.details.language) {
          console.log(`Language: ${response.data.details.language}`)
        }
        if (response.data.details.matches) {
          console.log(`Matches: ${response.data.details.matches.join(', ')}`)
        }
      }
    } catch (error) {
      console.error(`Error testing "${testCase.text}":`, error)
    }
  }
}

testAPI().catch((error) => {
  console.error('Error running client test:', error)
})
