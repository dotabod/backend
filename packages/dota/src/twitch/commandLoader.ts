// Import fs and path modules to work with the file system
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const commandsDir = path.join(__dirname, 'commands')

// Read the commands directory and import all .ts files
// This will automatically import all command files without requiring manual updates
async function loadCommands() {
  try {
    const files = fs.readdirSync(commandsDir).filter((file) => file.endsWith('.ts')) // Only import .ts files

    const results = await Promise.allSettled(
      files.map(async (file) => {
        try {
          await import(`./commands/${file}`)
          return { file, success: true }
        } catch (error) {
          console.error(`Error importing command file ${file}:`, error)
          return { file, success: false, error }
        }
      }),
    )

    const successful = results.filter((r) => r.status === 'fulfilled' && r.value.success).length
    const failed = results.filter((r) => r.status === 'fulfilled' && !r.value.success).length

    console.log(`Loaded ${successful} commands successfully, ${failed} failed to load`)
  } catch (error) {
    console.error('Error reading commands directory:', error)
  }
}

// Load all commands
loadCommands()
