import dota2Api from 'dota2-api'
import { steamID64toSteamID32 } from './utils/index.js'

import * as dota from './dota/index.js'
import * as twitch from './twitch/index.js'

const accountId = steamID64toSteamID32('76561198347406259')

const apiDota = dota2Api.create(process.env.STEAM_WEB_API)

apiDota.getMatchDetails({ match_id: '6839746277' }).then(
  ({ result }) => {
    // console.log(JSON.stringify(result));
  },
  (errorResponseStatusText) => {
    console.log(errorResponseStatusText)
  },
)
