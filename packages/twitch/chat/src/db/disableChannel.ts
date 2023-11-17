// ./supabase.js
import supabase from './supabase.js'

/**
 * Disables a user channel by updating the settings in the database.
 *
 * @param {string} channel - The channel name to be disabled.
 * @returns {Promise<void>} - A promise indicating the completion of the operation.
 */
export async function disableChannel(channel: string): Promise<void> {
  const cleanedChannelName = channel.replace('#', '')
  const user = await fetchUser(cleanedChannelName)

  if (!user) {
    console.log('Failed to find user', cleanedChannelName)
    return
  }

  if (isUserAlreadyDisabled(user)) {
    return
  }

  console.log('Disabling user', cleanedChannelName)
  await disableUserCommands(user.id)
}

/**
 * Fetches user data from the database.
 *
 * @param {string} name - The name of the user.
 * @returns {Promise<any>} - A promise that resolves to the user's data.
 */
async function fetchUser(name: string) {
  const { data: user } = await supabase
    .from('users')
    .select('id, settings (key, value)')
    .eq('name', name)
    .single()

  return user
}

/**
 * Checks if the user's commands are already disabled.
 *
 * @param {any} user - The user object.
 * @returns {boolean} - True if the user is already disabled, false otherwise.
 */
function isUserAlreadyDisabled(user: Awaited<ReturnType<typeof fetchUser>>): boolean {
  return !!user?.settings.some(
    (setting) => setting.key === 'commandDisable' && setting.value === true,
  )
}

/**
 * Disables the user's commands in the database.
 *
 * @param {string} userId - The ID of the user.
 * @returns {Promise<void>} - A promise indicating the completion of the operation.
 */
async function disableUserCommands(userId: string): Promise<void> {
  await supabase.from('settings').upsert(
    {
      userId,
      key: 'commandDisable',
      value: true,
    },
    {
      onConflict: 'userId, key',
    },
  )
}
