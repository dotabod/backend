import { supabase } from '@dotabod/shared-utils'

import { aghsCommand } from './commands/aghs.js'
import { apmCommand } from './commands/apm.js'
import { avgCommand } from './commands/avg.js'
import { betaCommand } from './commands/beta.js'
import { clearsharingCommand } from './commands/clearsharing.js'
import { commandsCommand } from './commands/commands.js'
import { countCommand } from './commands/count.js'
import { d2ptCommand } from './commands/d2pt.js'
import { delayCommand } from './commands/delay.js'
import { dotabodCommand } from './commands/dotabod.js'
import { dotabuffCommand } from './commands/dotabuff.js'
import { fixdblCommand } from './commands/fixdbl.js'
import { fixpartyCommand } from './commands/fixparty.js'
import { friendsCommand } from './commands/friends.js'
import { geoCommand } from './commands/geo.js'
import { gmCommand } from './commands/gm.js'
import { gpmCommand } from './commands/gpm.js'
import { heroCommand } from './commands/hero.js'
import { innateCommand } from './commands/innate.js'
import { itemsCommand } from './commands/items.js'
import { lgCommand } from './commands/lg.js'
import { lgsCommand } from './commands/lgs.js'
import { localeCommand } from './commands/locale.js'
import { lostCommand } from './commands/lost.js'
import { matchCommand } from './commands/match.js'
import { mmrCommand } from './commands/mmr.js'
import { setmmrCommand } from './commands/mmr=.js'
import { modsonlyCommand } from './commands/modsonly.js'
import { muteCommand } from './commands/mute.js'
import { npCommand } from './commands/np.js'
import { onlineCommand } from './commands/online.js'
import { onlyCommand } from './commands/only.js'
import { opendotaCommand } from './commands/opendota.js'
import { pingCommand } from './commands/ping.js'
import { plebCommand } from './commands/pleb.js'
import { profileCommand } from './commands/profile.js'
import { rankedCommand } from './commands/ranked.js'
import { recentCommand } from './commands/recent.js'
import { refreshCommand } from './commands/refresh.js'
import { resetwlCommand } from './commands/resetwl.js'
import { roshanCommand } from './commands/roshan.js'
import { setCommand } from './commands/set.js'
import { setdelayCommand } from './commands/setdelay.js'
import { shardCommand } from './commands/shard.js'
import { smurfsCommand } from './commands/smurfs.js'
import { songCommand } from './commands/song.js'
import { spectatorsCommand } from './commands/spectators.js'
import { statsCommand } from './commands/stats.js'
import { steamCommand } from './commands/steam.js'
import { streamersCommand } from './commands/streamers.js'
import { testCommand } from './commands/test.js'
import { todayCommand } from './commands/today.js'
import { toggleCommand } from './commands/toggle.js'
import { unresolvedCommand } from './commands/unresolved.js'
import { versionCommand } from './commands/version.js'
import { winprobabilityCommand } from './commands/winprobability.js'
import { wlCommand } from './commands/wl.js'
import { wonCommand } from './commands/won.js'
import { xpmCommand } from './commands/xpm.js'
import { CommandHandler } from './lib/command-handler.js'

const commandCatalog = [
  aghsCommand,
  apmCommand,
  avgCommand,
  betaCommand,
  clearsharingCommand,
  commandsCommand,
  countCommand,
  d2ptCommand,
  delayCommand,
  dotabodCommand,
  dotabuffCommand,
  fixdblCommand,
  fixpartyCommand,
  friendsCommand,
  geoCommand,
  gmCommand,
  gpmCommand,
  heroCommand,
  innateCommand,
  itemsCommand,
  lgCommand,
  lgsCommand,
  localeCommand,
  lostCommand,
  matchCommand,
  mmrCommand,
  setmmrCommand,
  modsonlyCommand,
  muteCommand,
  npCommand,
  onlineCommand,
  onlyCommand,
  opendotaCommand,
  pingCommand,
  plebCommand,
  profileCommand,
  rankedCommand,
  recentCommand,
  refreshCommand,
  resetwlCommand,
  roshanCommand,
  setCommand,
  setdelayCommand,
  shardCommand,
  smurfsCommand,
  songCommand,
  spectatorsCommand,
  statsCommand,
  steamCommand,
  streamersCommand,
  testCommand,
  todayCommand,
  toggleCommand,
  unresolvedCommand,
  versionCommand,
  winprobabilityCommand,
  wlCommand,
  wonCommand,
  xpmCommand,
]

const { data } = await supabase.from('admin').select('users(name)').eq('role', 'admin')
const admins =
  data?.map((user: { users: { name: string } | null }) => user.users?.name ?? '').filter(Boolean) ??
  []

export const commandHandler = new CommandHandler(commandCatalog, admins)
