import { t } from 'i18next'

const heroes = {
  npc_dota_hero_antimage: {
    id: 1,
    localized_name: 'Anti-Mage',
    alias: ['am'],
  },
  npc_dota_hero_axe: {
    id: 2,
    localized_name: 'Axe',
    alias: [],
  },
  npc_dota_hero_bane: {
    id: 3,
    localized_name: 'Bane',
    alias: [],
  },
  npc_dota_hero_bloodseeker: {
    id: 4,
    localized_name: 'Bloodseeker',
    alias: ['bs'],
  },
  npc_dota_hero_crystal_maiden: {
    id: 5,
    localized_name: 'Crystal Maiden',
    alias: ['cm', 'rylai'],
  },
  npc_dota_hero_drow_ranger: {
    id: 6,
    localized_name: 'Drow Ranger',
    alias: ['drow'],
  },
  npc_dota_hero_earthshaker: {
    id: 7,
    localized_name: 'Earthshaker',
    alias: ['es', 'shaker'],
  },
  npc_dota_hero_juggernaut: {
    id: 8,
    localized_name: 'Juggernaut',
    alias: ['jug'],
  },
  npc_dota_hero_mirana: {
    id: 9,
    localized_name: 'Mirana',
    alias: ['potm'],
  },
  npc_dota_hero_morphling: {
    id: 10,
    localized_name: 'Morphling',
    alias: ['morph'],
  },
  npc_dota_hero_nevermore: {
    id: 11,
    localized_name: 'Shadow Fiend',
    alias: ['sf'],
  },
  npc_dota_hero_phantom_lancer: {
    id: 12,
    localized_name: 'Phantom Lancer',
    alias: ['pl'],
  },
  npc_dota_hero_puck: {
    id: 13,
    localized_name: 'Puck',
    alias: [],
  },
  npc_dota_hero_pudge: {
    id: 14,
    localized_name: 'Pudge',
    alias: [],
  },
  npc_dota_hero_razor: {
    id: 15,
    localized_name: 'Razor',
    alias: [],
  },
  npc_dota_hero_sand_king: {
    id: 16,
    localized_name: 'Sand King',
    alias: ['sk'],
  },
  npc_dota_hero_storm_spirit: {
    id: 17,
    localized_name: 'Storm Spirit',
    alias: ['storm'],
  },
  npc_dota_hero_sven: {
    id: 18,
    localized_name: 'Sven',
    alias: [],
  },
  npc_dota_hero_tiny: {
    id: 19,
    localized_name: 'Tiny',
    alias: [],
  },
  npc_dota_hero_vengefulspirit: {
    id: 20,
    localized_name: 'Vengeful Spirit',
    alias: ['venge', 'vs'],
  },
  npc_dota_hero_windrunner: {
    id: 21,
    localized_name: 'Windranger',
    alias: ['wr'],
  },
  npc_dota_hero_zuus: {
    id: 22,
    localized_name: 'Zeus',
    alias: [],
  },
  npc_dota_hero_kunkka: {
    id: 23,
    localized_name: 'Kunkka',
    alias: [],
  },
  npc_dota_hero_lina: {
    id: 25,
    localized_name: 'Lina',
    alias: [],
  },
  npc_dota_hero_lion: {
    id: 26,
    localized_name: 'Lion',
    alias: [],
  },
  npc_dota_hero_shadow_shaman: {
    id: 27,
    localized_name: 'Shadow Shaman',
    alias: ['ss', 'shaman', 'rhasta'],
  },
  npc_dota_hero_slardar: {
    id: 28,
    localized_name: 'Slardar',
    alias: [],
  },
  npc_dota_hero_tidehunter: {
    id: 29,
    localized_name: 'Tidehunter',
    alias: ['tide'],
  },
  npc_dota_hero_witch_doctor: {
    id: 30,
    localized_name: 'Witch Doctor',
    alias: ['wd', 'doc'],
  },
  npc_dota_hero_lich: {
    id: 31,
    localized_name: 'Lich',
    alias: [],
  },
  npc_dota_hero_riki: {
    id: 32,
    localized_name: 'Riki',
    alias: [],
  },
  npc_dota_hero_enigma: {
    id: 33,
    localized_name: 'Enigma',
    alias: ['nigma'],
  },
  npc_dota_hero_tinker: {
    id: 34,
    localized_name: 'Tinker',
    alias: ['tink'],
  },
  npc_dota_hero_sniper: {
    id: 35,
    localized_name: 'Sniper',
    alias: [],
  },
  npc_dota_hero_necrolyte: {
    id: 36,
    localized_name: 'Necrophos',
    alias: ['necro', 'necrolyte'],
  },
  npc_dota_hero_warlock: {
    id: 37,
    localized_name: 'Warlock',
    alias: ['wl'],
  },
  npc_dota_hero_beastmaster: {
    id: 38,
    localized_name: 'Beastmaster',
    alias: ['bm', 'beast'],
  },
  npc_dota_hero_queenofpain: {
    id: 39,
    localized_name: 'Queen of Pain',
    alias: ['qop'],
  },
  npc_dota_hero_venomancer: {
    id: 40,
    localized_name: 'Venomancer',
    alias: ['veno'],
  },
  npc_dota_hero_faceless_void: {
    id: 41,
    localized_name: 'Faceless Void',
    alias: ['fv', 'faceless', 'void'],
  },
  npc_dota_hero_skeleton_king: {
    id: 42,
    localized_name: 'Wraith King',
    alias: ['wk'],
  },
  npc_dota_hero_death_prophet: {
    id: 43,
    localized_name: 'Death Prophet',
    alias: ['dp'],
  },
  npc_dota_hero_phantom_assassin: {
    id: 44,
    localized_name: 'Phantom Assassin',
    alias: ['pa'],
  },
  npc_dota_hero_pugna: {
    id: 45,
    localized_name: 'Pugna',
    alias: [],
  },
  npc_dota_hero_templar_assassin: {
    id: 46,
    localized_name: 'Templar Assassin',
    alias: ['ta', 'templar', 'lanaya'],
  },
  npc_dota_hero_viper: {
    id: 47,
    localized_name: 'Viper',
    alias: [],
  },
  npc_dota_hero_luna: {
    id: 48,
    localized_name: 'Luna',
    alias: [],
  },
  npc_dota_hero_dragon_knight: {
    id: 49,
    localized_name: 'Dragon Knight',
    alias: ['dk'],
  },
  npc_dota_hero_dazzle: {
    id: 50,
    localized_name: 'Dazzle',
    alias: [],
  },
  npc_dota_hero_rattletrap: {
    id: 51,
    localized_name: 'Clockwerk',
    alias: ['cw', 'clock'],
  },
  npc_dota_hero_leshrac: {
    id: 52,
    localized_name: 'Leshrac',
    alias: ['lesh'],
  },
  npc_dota_hero_furion: {
    id: 53,
    localized_name: "Nature's Prophet",
    alias: ['np', 'natures', 'prophet', 'furion'],
  },
  npc_dota_hero_life_stealer: {
    id: 54,
    localized_name: 'Lifestealer',
    alias: ['ls', 'naix'],
  },
  npc_dota_hero_dark_seer: {
    id: 55,
    localized_name: 'Dark Seer',
    alias: ['ds'],
  },
  npc_dota_hero_clinkz: {
    id: 56,
    localized_name: 'Clinkz',
    alias: [],
  },
  npc_dota_hero_omniknight: {
    id: 57,
    localized_name: 'Omniknight',
    alias: ['omni'],
  },
  npc_dota_hero_enchantress: {
    id: 58,
    localized_name: 'Enchantress',
    alias: ['ench'],
  },
  npc_dota_hero_huskar: {
    id: 59,
    localized_name: 'Huskar',
    alias: ['husk'],
  },
  npc_dota_hero_night_stalker: {
    id: 60,
    localized_name: 'Night Stalker',
    alias: ['ns'],
  },
  npc_dota_hero_broodmother: {
    id: 61,
    localized_name: 'Broodmother',
    alias: ['brood', 'bm'],
  },
  npc_dota_hero_bounty_hunter: {
    id: 62,
    localized_name: 'Bounty Hunter',
    alias: ['bh', 'bounty'],
  },
  npc_dota_hero_weaver: {
    id: 63,
    localized_name: 'Weaver',
    alias: [],
  },
  npc_dota_hero_jakiro: {
    id: 64,
    localized_name: 'Jakiro',
    alias: ['jak'],
  },
  npc_dota_hero_batrider: {
    id: 65,
    localized_name: 'Batrider',
    alias: ['bat'],
  },
  npc_dota_hero_chen: {
    id: 66,
    localized_name: 'Chen',
    alias: [],
  },
  npc_dota_hero_spectre: {
    id: 67,
    localized_name: 'Spectre',
    alias: ['spec'],
  },
  npc_dota_hero_ancient_apparition: {
    id: 68,
    localized_name: 'Ancient Apparition',
    alias: ['aa'],
  },
  npc_dota_hero_doom_bringer: {
    id: 69,
    localized_name: 'Doom',
    alias: [],
  },
  npc_dota_hero_ursa: {
    id: 70,
    localized_name: 'Ursa',
    alias: [],
  },
  npc_dota_hero_spirit_breaker: {
    id: 71,
    localized_name: 'Spirit Breaker',
    alias: ['sb', 'bara'],
  },
  npc_dota_hero_gyrocopter: {
    id: 72,
    localized_name: 'Gyrocopter',
    alias: ['gyro'],
  },
  npc_dota_hero_alchemist: {
    id: 73,
    localized_name: 'Alchemist',
    alias: ['alch'],
  },
  npc_dota_hero_invoker: {
    id: 74,
    localized_name: 'Invoker',
    alias: ['invo', 'voker'],
  },
  npc_dota_hero_silencer: {
    id: 75,
    localized_name: 'Silencer',
    alias: ['nortrom'],
  },
  npc_dota_hero_obsidian_destroyer: {
    id: 76,
    localized_name: 'Outworld Destroyer',
    alias: ['od'],
  },
  npc_dota_hero_lycan: {
    id: 77,
    localized_name: 'Lycan',
    alias: [],
  },
  npc_dota_hero_brewmaster: {
    id: 78,
    localized_name: 'Brewmaster',
    alias: ['brew', 'panda'],
  },
  npc_dota_hero_shadow_demon: {
    id: 79,
    localized_name: 'Shadow Demon',
    alias: ['sd'],
  },
  npc_dota_hero_lone_druid: {
    id: 80,
    localized_name: 'Lone Druid',
    alias: ['ld', 'lone'],
  },
  npc_dota_hero_chaos_knight: {
    id: 81,
    localized_name: 'Chaos Knight',
    alias: ['ck', 'chaos'],
  },
  npc_dota_hero_meepo: {
    id: 82,
    localized_name: 'Meepo',
    alias: [],
  },
  npc_dota_hero_treant: {
    id: 83,
    localized_name: 'Treant Protector',
    alias: ['treant', 'tree'],
  },
  npc_dota_hero_ogre_magi: {
    id: 84,
    localized_name: 'Ogre Magi',
    alias: ['ogre'],
  },
  npc_dota_hero_undying: {
    id: 85,
    localized_name: 'Undying',
    alias: ['undy', 'und'],
  },
  npc_dota_hero_rubick: {
    id: 86,
    localized_name: 'Rubick',
    alias: ['rub', 'rubi', 'rubik'],
  },
  npc_dota_hero_disruptor: {
    id: 87,
    localized_name: 'Disruptor',
    alias: ['dis', 'thrall'],
  },
  npc_dota_hero_nyx_assassin: {
    id: 88,
    localized_name: 'Nyx Assassin',
    alias: ['nyx'],
  },
  npc_dota_hero_naga_siren: {
    id: 89,
    localized_name: 'Naga Siren',
    alias: ['naga', 'siren'],
  },
  npc_dota_hero_keeper_of_the_light: {
    id: 90,
    localized_name: 'Keeper of the Light',
    alias: ['kotl', 'keeper', 'ezalor'],
  },
  npc_dota_hero_wisp: {
    id: 91,
    localized_name: 'Io',
    alias: ['wisp'],
  },
  npc_dota_hero_visage: {
    id: 92,
    localized_name: 'Visage',
    alias: [],
  },
  npc_dota_hero_slark: {
    id: 93,
    localized_name: 'Slark',
    alias: [],
  },
  npc_dota_hero_medusa: {
    id: 94,
    localized_name: 'Medusa',
    alias: ['dusa', 'dussy'],
  },
  npc_dota_hero_troll_warlord: {
    id: 95,
    localized_name: 'Troll Warlord',
    alias: ['troll'],
  },
  npc_dota_hero_centaur: {
    id: 96,
    localized_name: 'Centaur Warrunner',
    alias: ['cent', 'centaur'],
  },
  npc_dota_hero_magnataur: {
    id: 97,
    localized_name: 'Magnus',
    alias: ['mag'],
  },
  npc_dota_hero_shredder: {
    id: 98,
    localized_name: 'Timbersaw',
    alias: ['timber'],
  },
  npc_dota_hero_bristleback: {
    id: 99,
    localized_name: 'Bristleback',
    alias: ['bb', 'bristle'],
  },
  npc_dota_hero_tusk: {
    id: 100,
    localized_name: 'Tusk',
    alias: ['tuskarr'],
  },
  npc_dota_hero_skywrath_mage: {
    id: 101,
    localized_name: 'Skywrath Mage',
    alias: ['sky', 'skywrath'],
  },
  npc_dota_hero_abaddon: {
    id: 102,
    localized_name: 'Abaddon',
    alias: ['aba', 'abba'],
  },
  npc_dota_hero_elder_titan: {
    id: 103,
    localized_name: 'Elder Titan',
    alias: ['et', 'elder'],
  },
  npc_dota_hero_legion_commander: {
    id: 104,
    localized_name: 'Legion Commander',
    alias: ['lc', 'legion'],
  },
  npc_dota_hero_techies: {
    id: 105,
    localized_name: 'Techies',
    alias: ['tech'],
  },
  npc_dota_hero_ember_spirit: {
    id: 106,
    localized_name: 'Ember Spirit',
    alias: ['ember'],
  },
  npc_dota_hero_earth_spirit: {
    id: 107,
    localized_name: 'Earth Spirit',
    alias: ['earth', 'es'],
  },
  npc_dota_hero_abyssal_underlord: {
    id: 108,
    localized_name: 'Underlord',
    alias: ['ul', 'under', 'pitlord'],
  },
  npc_dota_hero_terrorblade: {
    id: 109,
    localized_name: 'Terrorblade',
    alias: ['tb', 'terror'],
  },
  npc_dota_hero_phoenix: {
    id: 110,
    localized_name: 'Phoenix',
    alias: [],
  },
  npc_dota_hero_oracle: {
    id: 111,
    localized_name: 'Oracle',
    alias: [],
  },
  npc_dota_hero_winter_wyvern: {
    id: 112,
    localized_name: 'Winter Wyvern',
    alias: ['ww', 'winter', 'wyvern'],
  },
  npc_dota_hero_arc_warden: {
    id: 113,
    localized_name: 'Arc Warden',
    alias: ['arc'],
  },
  npc_dota_hero_monkey_king: {
    id: 114,
    localized_name: 'Monkey King',
    alias: ['mk', 'monkey'],
  },
  npc_dota_hero_dark_willow: {
    id: 119,
    localized_name: 'Dark Willow',
    alias: ['dw', 'willow'],
  },
  npc_dota_hero_pangolier: {
    id: 120,
    localized_name: 'Pangolier',
    alias: ['pango'],
  },
  npc_dota_hero_grimstroke: {
    id: 121,
    localized_name: 'Grimstroke',
    alias: ['grim'],
  },
  npc_dota_hero_hoodwink: {
    id: 123,
    localized_name: 'Hoodwink',
    alias: ['hw', 'hoodwinkle'],
  },
  npc_dota_hero_void_spirit: {
    id: 126,
    localized_name: 'Void Spirit',
    alias: ['vs'],
  },
  npc_dota_hero_snapfire: {
    id: 128,
    localized_name: 'Snapfire',
    alias: ['snap', 'mortimer', 'grandma', 'granny'],
  },
  npc_dota_hero_mars: {
    id: 129,
    localized_name: 'Mars',
    alias: [],
  },
  npc_dota_hero_dawnbreaker: {
    id: 135,
    localized_name: 'Dawnbreaker',
    alias: ['db', 'dawn'],
  },
  npc_dota_hero_marci: {
    id: 136,
    localized_name: 'Marci',
    alias: [],
  },
  npc_dota_hero_primal_beast: {
    id: 137,
    localized_name: 'Primal Beast',
    alias: ['pb', 'primal'],
  },
  npc_dota_hero_muerta: {
    id: 138,
    localized_name: 'Muerta',
    alias: [],
  },
}

export const translatedColor = (color: string, lng: string) => {
  if (lng === 'en') return color

  const props = { lng }
  switch (color) {
    case 'Blue':
      return t('colors.blue', props)
    case 'Teal':
      return t('colors.teal', props)
    case 'Purple':
      return t('colors.purple', props)
    case 'Yellow':
      return t('colors.yellow', props)
    case 'Orange':
      return t('colors.orange', props)
    case 'Pink':
      return t('colors.pink', props)
    case 'Olive':
      return t('colors.olive', props)
    case 'Cyan':
      return t('colors.cyan', props)
    case 'Green':
      return t('colors.green', props)
    case 'Brown':
      return t('colors.brown', props)
    default:
      return color
  }
}

export const heroColors = 'Blue,Teal,Purple,Yellow,Orange,Pink,Olive,Cyan,Green,Brown'.split(',')
export function getHeroNameById(id: number, index?: number) {
  if (!id && typeof index === 'number') return heroColors[index]

  const name = getHeroById(id)?.localized_name
  if (!name && typeof index === 'number') {
    return heroColors[index]
  }

  return name ?? 'Unknown'
}

export function getHeroById(id: number) {
  if (!id) return null

  return Object.values(heroes).find((h) => h.id === id)
}

export function getHeroByName(name: string) {
  if (!name) return null

  // only keep a-z in name
  name = name
    .replace(/[^a-z]/gi, '')
    .toLowerCase()
    .trim()

  const hero = Object.values(heroes).find((h) => {
    const inName = h.localized_name
      // replace all spaces with nothing, and only keep a-z
      .replace(/[^a-z]/gi, '')
      .toLowerCase()
      .trim()

    // check for alias
    const hasAlias = h.alias.some(
      (alias) =>
        alias
          .replace(/[^a-z]/gi, '')
          .toLowerCase()
          .trim() === name,
    )
    return inName.includes(name) || hasAlias
  })

  return hero
}

export default heroes
