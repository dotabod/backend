import { Dota2 } from 'dotagsi'
import { Slots, ItemRaw } from 'dotagsi/types/dota2'

namespace Express {
  interface Request {
    client: Context
  }
}

type Items = Slots<'slot' | 'stash' | 'teleport' | 'neutral', ItemRaw>

type Dota2 = Dota2 & {
  items?: Items
}
