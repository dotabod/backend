import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type CommandMap = Record<string, any>
const commands: CommandMap = {}

fs.readdirSync(path.resolve(__dirname, 'commands')).forEach((file) => {
  if (file.endsWith('.js') || file.endsWith('.ts')) {
    const command = import(`./commands/${file}`)
    commands[file.slice(0, -3)] = command
  }
})

export default commands
