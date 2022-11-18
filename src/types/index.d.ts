import { Dota2, Hero } from 'dotagsi'
import { Slots, ItemRaw } from 'dotagsi/types/dota2'
import { GSIClient } from '../dota/lib/dota2-gsi'

declare global {
  namespace Express {
    interface Request {
      client: Context
    }
  }
}

type Items = Slots<'slot' | 'stash' | 'teleport' | 'neutral', ItemRaw>

type Dota2 = Dota2 & {
  items?: Items
  hero?: Hero
  previously?: Dota2
  added?: Dota2
}

type SocketClient = {
  gsi?: GSIClient
  name: string
  steam32Id: number | null
  mmr: number
  token: string
  account: {
    refresh_token: string
    access_token: string
    providerAccountId: string
  }
  sockets: string[]
}
