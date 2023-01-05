import fs from 'fs'
import path from 'path'

type CommandMap = Record<string, any>
const commands: CommandMap = {}

fs.readdirSync(path.resolve('src', 'twitch', 'commands')).forEach((file) => {
  if (file.endsWith('.js') || file.endsWith('.ts')) {
    const command = import(`./commands/${file}`)
    commands[file.slice(0, -3)] = command
  }
})

export default commands
