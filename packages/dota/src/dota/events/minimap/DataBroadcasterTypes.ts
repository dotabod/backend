import type { Entity } from '../../../types.js'

/**
 * Represents a single entity data structure with data, lastUpdate, and timeout
 */
export interface EntityData<T = Entity[]> {
  data: T
  lastUpdate: number
  timeout: number
}

/**
 * The supported entity types in the minimap data
 */
export type MinimapEntityType =
  | 'heroes'
  | 'hero_units'
  | 'couriers'
  | 'creeps'
  | 'buildings'
  | 'tp'
  | 'scan'

/**
 * Minimap data structure containing all entity types
 */
export interface MinimapData {
  heroes: EntityData
  hero_units: EntityData
  couriers: EntityData
  creeps: EntityData
  buildings: EntityData
  tp: EntityData
  scan: EntityData
}

/**
 * The parsed data structure expected by the DataBroadcaster
 */
export interface ParsedData {
  minimap?: {
    [key in MinimapEntityType]?: Entity[]
  }
  status?: {
    active: boolean
  }
}

/**
 * Interface for the DataBroadcaster class
 */
export interface DataBroadcasterInterface {
  token: string
  minimap: MinimapData
  resetData(): void
  sendData(parsedData: ParsedData): void
}
