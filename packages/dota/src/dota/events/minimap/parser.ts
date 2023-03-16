import { Entity, MapData, Packet, Player } from '../../../types.js'
import { isPlayingMatch } from '../../lib/isPlayingMatch.js'
import { DataBroadcaster } from './DataBroadcaster.js'

class MinimapParser {
  lastBroadcastTime = 0
  prevHeroes = []
  xLength = 8205
  yLength = 8174
  minimapWidth = this.xLength * 2
  minimapHeight = this.yLength * 2

  buildings: string[] = [
    'npc_dota_goodguys_fort',
    'npc_dota_goodguys_melee_rax_mid',
    'npc_dota_goodguys_range_rax_mid',
    'npc_dota_goodguys_melee_rax_top',
    'npc_dota_goodguys_range_rax_top',
    'npc_dota_goodguys_melee_rax_bot',
    'npc_dota_goodguys_range_rax_bot',
    'npc_dota_goodguys_fillers',
    'npc_dota_goodguys_tower1_top',
    'npc_dota_goodguys_tower1_mid',
    'npc_dota_goodguys_tower1_bot',
    'npc_dota_goodguys_tower2_top',
    'npc_dota_goodguys_tower2_mid',
    'npc_dota_goodguys_tower2_bot',
    'npc_dota_goodguys_tower3_top',
    'npc_dota_goodguys_tower3_mid',
    'npc_dota_goodguys_tower3_bot',
    'npc_dota_goodguys_tower4',
    'npc_dota_badguys_fort',
    'npc_dota_badguys_melee_rax_mid',
    'npc_dota_badguys_range_rax_mid',
    'npc_dota_badguys_melee_rax_top',
    'npc_dota_badguys_range_rax_top',
    'npc_dota_badguys_melee_rax_bot',
    'npc_dota_badguys_range_rax_bot',
    'npc_dota_badguys_fillers',
    'npc_dota_badguys_tower1_top',
    'npc_dota_badguys_tower1_mid',
    'npc_dota_badguys_tower1_bot',
    'npc_dota_badguys_tower2_top',
    'npc_dota_badguys_tower2_mid',
    'npc_dota_badguys_tower2_bot',
    'npc_dota_badguys_tower3_top',
    'npc_dota_badguys_tower3_mid',
    'npc_dota_badguys_tower3_bot',
    'npc_dota_badguys_tower4',
    'npc_dota_watch_tower',
  ]

  creeps: string[] = [
    'npc_dota_creep_goodguys_melee',
    'npc_dota_creep_goodguys_ranged',
    'npc_dota_creep_goodguys_flagbearer',
    'npc_dota_creep_goodguys_siege',
    'npc_dota_creep_goodguys_melee_upgraded',
    'npc_dota_creep_goodguys_ranged_upgraded',
    'npc_dota_creep_goodguys_flagbearer_upgraded',
    'npc_dota_creep_goodguys_siege_upgraded',
    'npc_dota_creep_goodguys_melee_upgraded_mega',
    'npc_dota_creep_goodguys_ranged_upgraded_mega',
    'npc_dota_creep_goodguys_flagbearer_upgraded_mega',
    'npc_dota_creep_goodguys_siege_upgraded_mega',
    'npc_dota_creep_badguys_melee',
    'npc_dota_creep_badguys_ranged',
    'npc_dota_creep_badguys_flagbearer',
    'npc_dota_creep_badguys_siege',
    'npc_dota_creep_badguys_melee_upgraded',
    'npc_dota_creep_badguys_ranged_upgraded',
    'npc_dota_creep_badguys_flagbearer_upgraded',
    'npc_dota_creep_badguys_siege_upgraded',
    'npc_dota_creep_badguys_melee_upgraded_mega',
    'npc_dota_creep_badguys_ranged_upgraded_mega',
    'npc_dota_creep_badguys_flagbearer_upgraded_mega',
    'npc_dota_creep_badguys_siege_upgraded_mega',
  ]

  init(data: Packet, dataBroadcaster: DataBroadcaster) {
    if (!isPlayingMatch(data)) return

    const parsed = this.parse(data)

    if (parsed.status === false) {
      const currentTime = new Date().getTime()
      if (currentTime - this.lastBroadcastTime >= 5000) {
        dataBroadcaster.sendData(parsed)
        this.lastBroadcastTime = currentTime
      }
      return
    }

    dataBroadcaster.sendData(parsed)
  }

  isGameOnGoing(mapData: MapData): boolean {
    return (
      mapData &&
      ['DOTA_GAMERULES_STATE_GAME_IN_PROGRESS', 'DOTA_GAMERULES_STATE_PRE_GAME'].includes(
        mapData.game_state,
      )
    )
  }

  isGamePaused(mapData: MapData): boolean {
    return this.isGameOnGoing(mapData) && mapData.paused
  }

  isPlaying(playerData: Player): boolean {
    return playerData && playerData.steamid !== undefined
  }

  isEntityAlive(entity: Entity): boolean {
    return !!(entity.visionrange && entity.visionrange > 1)
  }

  isValidHero(entity: any): boolean {
    // Remove Monkey King Aghs Illus
    if (entity.unitname.includes('hero_monkey_king')) {
      return entity.visionrange > 500
    }

    return true
  }

  cleanData(entity: Entity): any {
    // Simplify Coordinates
    if (entity.xpos !== undefined) {
      if (entity.xpos >= 0) {
        entity.xpos = Number(entity.xpos) + Number(this.xLength)
      } else {
        entity.xpos = this.xLength - Math.abs(entity.xpos)
      }

      const percentage = (entity.xpos / this.minimapWidth) * 100
      entity.xposP = percentage.toFixed(3) + '%'
    }

    if (entity.ypos !== undefined) {
      if (entity.ypos >= 0) {
        entity.ypos = entity.ypos + this.yLength
      } else {
        entity.ypos = this.yLength - Math.abs(entity.ypos)
      }

      const percentage = (entity.ypos / this.minimapHeight) * 100
      entity.yposP = percentage.toFixed(3) + '%'
    }

    if (entity.yaw !== undefined) {
      if (entity.yaw < 0) {
        entity.yaw += 360
      }
    }

    // Name teams
    switch (entity.team) {
      case 2:
        entity.teamP = 'radiant'
        break
      case 3:
        entity.teamP = 'dire'
        break
      default:
        entity.teamP = 'npc'
    }

    // Simplify hero names
    if (entity.name) {
      entity.name = entity.name.replace('npc_dota_hero_', '')
    }

    // Simplify unit names
    if (entity.unitname) {
      entity.unitname = entity.unitname
        .replace('npc_dota_goodguys_', '')
        .replace('npc_dota_badguys_', '')
        .replace('npc_dota_creep_goodguys', 'creep')
        .replace('npc_dota_creep_badguys', 'creep')
        .replace('npc_dota_', '')
    }

    // Simplify image names
    if (entity.image) {
      entity.image = entity.image.replace('minimap_', '')
    }

    return entity
  }

  parse(data: Packet) {
    const currentCfgFile = data.map && this.isGameOnGoing(data.map) && data.player && data.hero
    const betaCfgFile = data.minimap
    if (!currentCfgFile || !betaCfgFile) {
      return {
        status: {
          active: false,
        },
      }
    }

    // Parse Status
    const status: any = {
      active: true,
      paused: this.isGamePaused(data.map!),
      playing: this.isPlaying(data.player!),
      hero: this.isPlaying(data.player!) ? data.hero!.name : data.hero!.team2?.player0.name,
      team: this.isPlaying(data.player!) ? data.player!.team_name : 'radiant',
    }

    // Parse Minimap
    const minimap: any = {
      heroes: [],
      hero_units: [],
      couriers: [],
      creeps: [],
      buildings: [],
      tp: [],
      scan: [],
    }
    const entities = Object.keys(data.minimap!)

    entities.forEach((key) => {
      const entity = data.minimap![key]

      // Heroes
      if (
        entity.unitname &&
        entity.unitname.includes('npc_dota_hero') &&
        this.isEntityAlive(entity) &&
        this.isValidHero(entity)
      ) {
        minimap.heroes.push(this.cleanData(entity))
      }

      // Hero Units
      if (
        entity.image &&
        entity.image === 'minimap_controlledcreep' &&
        this.isEntityAlive(entity)
      ) {
        minimap.hero_units.push(this.cleanData(entity))
      }

      // Couriers
      if (entity.unitname && entity.unitname === 'npc_dota_courier' && this.isEntityAlive(entity)) {
        minimap.couriers.push(this.cleanData(entity))
      }

      // Creeps
      if (entity.unitname && this.creeps.includes(entity.unitname) && this.isEntityAlive(entity)) {
        minimap.creeps.push(this.cleanData(entity))
      }

      // Buildings
      if (entity.unitname && this.buildings.includes(entity.unitname)) {
        minimap.buildings.push(this.cleanData(entity))
      }

      // Teleporting
      if (
        entity.image &&
        entity.image === 'minimap_ping_teleporting' &&
        entity.eventduration &&
        entity.eventduration > 1
      ) {
        minimap.tp.push(this.cleanData(entity))
      }

      // Scanning
      if (
        entity.image &&
        entity.image === 'minimap_ping_teleporting' &&
        entity.eventduration &&
        entity.eventduration === 1
      ) {
        minimap.scan.push(this.cleanData(entity))
      }
    })

    return {
      minimap: minimap,
      status: status,
    }
  }
}

const minimapParser = new MinimapParser()
export default minimapParser
