import { Dota2, Hero } from 'dotagsi'

import { GSIClient } from '../dota/lib/dota2-gsi'

declare global {
  namespace Express {
    interface Request {
      client: Context
    }
  }
}

interface ItemRaw {
  name: string
  purchaser?: number | null
  can_cast?: boolean | null
  cooldown?: number | null
  passive?: boolean | null
  charges?: number | null
}

type SlotsIds = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10

type Slots<Type extends string, N> = {
  [x in `${Type}${SlotsIds}`]?: N
}

type Items = Slots<'slot' | 'stash' | 'teleport' | 'neutral', ItemRaw>

type Dota2 = Dota2 & {
  items?: Items
  hero?: Hero
  previously?: Dota2
  added?: Dota2
}

interface SocketClient {
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
