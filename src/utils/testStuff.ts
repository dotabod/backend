// @ts-ignore
import Dota2Api from 'dota2-api'

// Just used for testing
const randomMatch = '6862608251'
const playerId = '161444478' // draskyl

const apiDota = Dota2Api.create(process.env.STEAM_WEB_API)

// const {data: predictions} = await api.predictions.getPredictions(?.id || '', { limit: 1})
// console.log(predictions[0].status)

// const authProvider = await getAuthProvider(channel)

// const api = new ApiClient({ authProvider })
// const user = await api.users.getUserByName(channel)

// console.log(user)

// const { data: predictions } = await api.predictions.getPredictions(user?.id || '')

// const channel = supabase.channel('db-changes')
// channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'users' }, (payload) => {
//   console.log('New user to send bot to: ', payload)
// })

// channel.subscribe(async (status) => {
//   if (status === 'SUBSCRIBED') {
//     console.log('Ready to receive database changes!')
//   }
// })

// fetch(`https://api.opendota.com/api/matches/${randomMatch}`)
//   .then((response) => response.json())
//   .then((data) => console.log(data))

// fetch(`https://api.opendota.com/api/players/${playerId}/matches?date=1&game_mode=22`)
//   .then((response) => response.json())
//   .then((data) => console.log(data))

// fetch(`https://api.opendota.com/api/players/${playerId}`)
//   .then((response) => response.json())
//   .then((data) => console.log(data?.leaderboard_rank))

// radiant_win: false || true
// json returned + undefined radiant_win = not scored, refund bets
// {"error":"Match ID not found"} = ongoing match
// function getMatch(id: string) {
//   try {
//     apiDota.getMatchDetails({ match_id: id }).then(
//       (response) => {
//         console.log(response)
//       },
//       () => {
//         console.log('Game coordinator is down probably. Check again later')
//       },
//     )
//   } catch (e) {
//     console.log('Game coordinator is down probably. Check again later')
//   }
// }
