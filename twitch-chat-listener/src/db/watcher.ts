import { User } from '../../prisma/generated/postgresclient/index.js'
import { chatClient } from '../index.js'
import supabase from './supabase.js'
import { updateFollowForUser } from './update-follows.js'
import { updateUsernameForId } from './update-username.js'

const channel = supabase.channel('db-changes')

async function handleNewUser(user: User) {
  try {
    await updateFollowForUser(user.id)
    console.log('Follows updated for new user')
  } catch (e) {
    console.error('Error updating follows for new user', e)
  }

  try {
    const realUsername = await updateUsernameForId(user.id)
    console.log('Username updated for new user')
    await chatClient.join(realUsername ?? user.name)
    console.log('[SUPABASE]', 'Joined channel new name', realUsername ?? user.name)
  } catch (e) {
    console.error('Error updating username for new user', e)
    await chatClient.join(user.name)
    console.log('[SUPABASE]', 'Joined channel old name', user.name)
  }
}

channel
  .subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      console.log('[SUPABASE]', 'Ready to receive database changes!')
    }
  })
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'users' }, (payload) => {
    if (process.env.NODE_ENV !== 'production') {
      return
    }

    const user = payload.new as User
    console.log('[SUPABASE]', 'New user to send bot to: ', user.name)
    void handleNewUser(user)
  })
