// Just used for testing
const randomMatch = '6862608251'
const playerId = '849473199'

const apiDota = dota2Api.create(process.env.STEAM_WEB_API)

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

// radiant_win: false || true
// json returned + undefined radiant_win = not scored, refund bets
// {"error":"Match ID not found"} = ongoing match
// function getMatch(id) {
// try {
//   apiDota.getMatchDetails({ match_id: id }).then(
//     ({ result }) => {
//       console.log(JSON.stringify(result))
//     },
//     (e) => {
//       console.log('Game coordinator is down probably. Check again later')
//     },
//   )
// } catch (e) {
//   console.log('Game coordinator is down probably. Check again later')
// }
// }
