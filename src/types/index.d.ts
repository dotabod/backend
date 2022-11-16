import { GSIClient } from '@/dota/lib/dota2-gsi'
import { Dota2, Hero } from 'dotagsi'
import { Slots, ItemRaw } from 'dotagsi/types/dota2'

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
  playerId?: string
  mmr: number
  token: string
  sockets: string[]
}
