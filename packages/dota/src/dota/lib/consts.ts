import { GSIHandler } from '../GSIHandler.js'

// just here for reference, not being used
// full list at https://github.com/SteamDatabase/GameTracking-Dota2/blob/master/Protobufs/dota_shared_enums.proto
const allSates = [
  'DOTA_GAMERULES_STATE_INIT',
  'DOTA_GAMERULES_STATE_WAIT_FOR_PLAYERS_TO_LOAD',
  'DOTA_GAMERULES_STATE_HERO_SELECTION',
  'DOTA_GAMERULES_STATE_STRATEGY_TIME',
  'DOTA_GAMERULES_STATE_PRE_GAME',
  'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS',
  'DOTA_GAMERULES_STATE_POST_GAME',
  'DOTA_GAMERULES_STATE_DISCONNECT',
  'DOTA_GAMERULES_STATE_TEAM_SHOWCASE',
  'DOTA_GAMERULES_STATE_CUSTOM_GAME_SETUP',
  'DOTA_GAMERULES_STATE_WAIT_FOR_MAP_TO_LOAD',
  'DOTA_GAMERULES_STATE_SCENARIO_SETUP',
  'DOTA_GAMERULES_STATE_PLAYER_DRAFT',
  'DOTA_GAMERULES_STATE_LAST',
]

export const playingStates = [
  'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS',
  'DOTA_GAMERULES_STATE_PRE_GAME',
]

export const dontBlockStates = [
  'DOTA_GAMERULES_STATE_INIT',
  'DOTA_GAMERULES_STATE_PLAYER_DRAFT',
  'DOTA_GAMERULES_STATE_WAIT_FOR_PLAYERS_TO_LOAD',
  'DOTA_GAMERULES_STATE_POST_GAME',
  'DOTA_GAMERULES_STATE_TEAM_SHOWCASE',
  'DOTA_GAMERULES_STATE_CUSTOM_GAME_SETUP',
  'DOTA_GAMERULES_STATE_WAIT_FOR_MAP_TO_LOAD',

  // Adding this strategy to don't block because this state is checked manually
  // This state actually means all players are locked in and picked
  // It doesn't mean only the streamer is locked in like I thought
  // So since all are locked in, everyone can see heroes, and we should unblock all
  'DOTA_GAMERULES_STATE_STRATEGY_TIME',
]

export const pickSates = ['DOTA_GAMERULES_STATE_HERO_SELECTION']

export const blockTypes = [
  { type: 'picks', states: pickSates },
  { type: 'playing', states: playingStates },
  { type: 'empty', states: dontBlockStates },
]

export const isDev = process.env.NODE_ENV === 'development'

export const GLOBAL_DELAY = isDev ? 0 : 7000 // 7s for prod only

export const ranks = [
  { range: [0, 153], title: 'Herald☆1', image: '11.png' },
  { range: [154, 307], title: 'Herald☆2', image: '12.png' },
  { range: [308, 461], title: 'Herald☆3', image: '13.png' },
  { range: [462, 615], title: 'Herald☆4', image: '14.png' },
  { range: [616, 769], title: 'Herald☆5', image: '15.png' },
  { range: [770, 923], title: 'Guardian☆1', image: '21.png' },
  { range: [924, 1077], title: 'Guardian☆2', image: '22.png' },
  { range: [1078, 1231], title: 'Guardian☆3', image: '23.png' },
  { range: [1232, 1385], title: 'Guardian☆4', image: '24.png' },
  { range: [1386, 1539], title: 'Guardian☆5', image: '25.png' },
  { range: [1540, 1693], title: 'Crusader☆1', image: '31.png' },
  { range: [1694, 1847], title: 'Crusader☆2', image: '32.png' },
  { range: [1848, 2001], title: 'Crusader☆3', image: '33.png' },
  { range: [2002, 2155], title: 'Crusader☆4', image: '34.png' },
  { range: [2156, 2309], title: 'Crusader☆5', image: '35.png' },
  { range: [2310, 2463], title: 'Archon☆1', image: '41.png' },
  { range: [2464, 2617], title: 'Archon☆2', image: '42.png' },
  { range: [2618, 2771], title: 'Archon☆3', image: '43.png' },
  { range: [2772, 2925], title: 'Archon☆4', image: '44.png' },
  { range: [2926, 3079], title: 'Archon☆5', image: '45.png' },
  { range: [3080, 3233], title: 'Legend☆1', image: '51.png' },
  { range: [3234, 3387], title: 'Legend☆2', image: '52.png' },
  { range: [3388, 3541], title: 'Legend☆3', image: '53.png' },
  { range: [3542, 3695], title: 'Legend☆4', image: '54.png' },
  { range: [3696, 3849], title: 'Legend☆5', image: '55.png' },
  { range: [3850, 4003], title: 'Ancient☆1', image: '61.png' },
  { range: [4004, 4157], title: 'Ancient☆2', image: '62.png' },
  { range: [4158, 4311], title: 'Ancient☆3', image: '63.png' },
  { range: [4312, 4465], title: 'Ancient☆4', image: '64.png' },
  { range: [4466, 4619], title: 'Ancient☆5', image: '65.png' },
  { range: [4620, 4819], title: 'Divine☆1', image: '71.png' },
  { range: [4820, 5019], title: 'Divine☆2', image: '72.png' },
  { range: [5020, 5219], title: 'Divine☆3', image: '73.png' },
  { range: [5220, 5419], title: 'Divine☆4', image: '74.png' },
  { range: [5420, 5619], title: 'Divine☆5', image: '75.png' },
]

export const leaderRanks = [
  { range: [1, 1], image: '92.png', sparklingEffect: true },
  { range: [2, 10], image: '92.png', sparklingEffect: true },
  { range: [11, 100], image: '91.png', sparklingEffect: true },
  { range: [101, 1000], image: '80.png', sparklingEffect: true },
  { range: [1001, 100000], image: '80.png', sparklingEffect: false },
]

export const plebMode = new Set()
export const modMode = new Set()

export const ADMIN_CHANNELS = (process.env.ADMIN_CHANNELS ?? '').split(',')

export const invalidTokens = new Set(['', null, undefined, 0])

export const gsiHandlers = new Map<string, GSIHandler>()
export const twitchIdToToken = new Map<string, string>()
export const pendingCheckAuth = new Map<string, boolean>()
export const lookingupToken = new Map<string, boolean>()
