import fs from 'fs'
import path from 'path'

type CommandMap = Record<string, any>
const commands: CommandMap = {}

fs.readdirSync(path.join(__dirname, './commands')).forEach((file) => {
  if (file.endsWith('.ts')) {
    const command = import(`./commands/${file}`)
    commands[file.slice(0, -3)] = command
  }
})

export default commands
