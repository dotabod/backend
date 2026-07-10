/**
 * Pure decision unit for Steam/Dota GC connection liveness.
 *
 * Background: the connection is driven through `dotabod/node-dota2` (unmaintained,
 * bridged to `steam-user` via a shim). node-dota2 owns hidden `setInterval` knock
 * timers we can't see, and it *knocks the GC forever* on a failed ClientHello
 * without ever standing its own timer down on `hellotimeout`. When our old code
 * reacted to `hellotimeout` by calling `exit()` + `launch()` we raced those hidden
 * timers and ended up with TWO concurrent knock loops (observed 2026-07-10: two
 * interleaved 30s timeout cadences), which a container restart only masked until
 * it forked again.
 *
 * Rather than keep nursing that library's state machine, we make GC liveness a
 * single explicit reducer with one escalation ladder, and treat a fresh process
 * as the only reliably-clean recovery state (crash-only: `exit` → Docker
 * `unless-stopped`/`on-failure` restarts us, dota reconnects over its
 * auto-reconnecting socket in ~7s). This module holds *only* the decisions; all
 * effects (launch/exit/relogin/process.exit) live in steam.ts so this stays
 * unit-testable with an injected clock.
 */

/** Events the watchdog reacts to, mapped from node-dota2 / steam-user. */
export type GcEvent =
  /** node-dota2 emitted `ready` (GC ClientWelcome received). */
  | { type: 'gcReady' }
  /** node-dota2 emitted `unready` (GC session lost). */
  | { type: 'gcUnready' }
  /** node-dota2 emitted `hellotimeout` (ClientHello unanswered ~30s). */
  | { type: 'helloTimeout' }
  /** steam-user logged on to the CM (not yet GC-ready). */
  | { type: 'loggedOn' }
  /** steam-user disconnected from the CM (autoRelogin may or may not recover). */
  | { type: 'disconnected' }
  /** Periodic tick so a stuck "not ready" can escalate without a triggering event. */
  | { type: 'tick' }

/** What steam.ts should do in response. Exactly one intent per event. */
export type GcAction =
  /** Clean re-knock: exit() then launch() the GC (re-entrancy handled in glue). */
  | { type: 'relaunch'; reason: string }
  /** Give up and exit the process so Docker restarts us clean. */
  | { type: 'exit'; reason: string }
  /** Nothing to do. */
  | { type: 'noop' }

export interface GcWatchdogOptions {
  /**
   * How long the GC may stay continuously not-ready (despite relaunches, or a CM
   * disconnect that never recovers) before we exit the process. Default 3min.
   */
  deadExitMs?: number
  /**
   * Minimum spacing between our own relaunch attempts, so we don't stack knock
   * loops on top of node-dota2's. Default 30s (matches the old hello-timeout wait).
   */
  relaunchIntervalMs?: number
  /** Injectable clock for tests. Defaults to Date.now. */
  now?: () => number
}

const DEFAULT_DEAD_EXIT_MS = 180_000
const DEFAULT_RELAUNCH_INTERVAL_MS = 30_000

/**
 * Single authority for "is the GC alive, and if not what do we do about it".
 *
 * The ladder, given the GC is not ready:
 *   1. On `helloTimeout`/`gcUnready`/`tick`, if it's been >= relaunchIntervalMs
 *      since our last relaunch, emit ONE `relaunch`. Never emits `relaunch` while
 *      one is still "fresh" — this is the double-timer guard.
 *   2. If the GC has been continuously not-ready for >= deadExitMs, emit `exit`
 *      instead. Docker restarts us into a clean process.
 * A `gcReady` at any point resets the ladder.
 */
export class GcWatchdog {
  private readonly deadExitMs: number
  private readonly relaunchIntervalMs: number
  private readonly now: () => number

  private ready = false
  /** When the GC first went (or started) not-ready. undefined once ready. */
  private notReadySince: number | undefined
  /** When we last emitted a `relaunch`, to space out re-knocks. */
  private lastRelaunchAt: number | undefined

  constructor(opts: GcWatchdogOptions = {}) {
    this.deadExitMs = opts.deadExitMs ?? DEFAULT_DEAD_EXIT_MS
    this.relaunchIntervalMs = opts.relaunchIntervalMs ?? DEFAULT_RELAUNCH_INTERVAL_MS
    this.now = opts.now ?? Date.now
    // Start life not-ready: the process just launched the GC and is awaiting
    // ClientWelcome. This makes the startup handshake subject to the same
    // dead-exit ceiling as a mid-life stall.
    this.notReadySince = this.now()
  }

  isReady(): boolean {
    return this.ready
  }

  /** Feed an event, get the single action to perform. */
  step(event: GcEvent): GcAction {
    const t = this.now()

    switch (event.type) {
      case 'gcReady':
        this.ready = true
        this.notReadySince = undefined
        this.lastRelaunchAt = undefined
        return { type: 'noop' }

      case 'loggedOn':
        // CM is up but GC isn't ready yet; ensure the not-ready clock is running
        // so a logon that never reaches GC-ready still escalates.
        if (!this.ready && this.notReadySince === undefined) this.notReadySince = t
        return { type: 'noop' }

      case 'gcUnready':
      case 'disconnected':
      case 'helloTimeout':
        // These all mean the GC is not usable: flip out of ready and start (or
        // keep) the not-ready clock, then evaluate the ladder.
        this.ready = false
        if (this.notReadySince === undefined) this.notReadySince = t
        return this.evaluateNotReady(t)

      case 'tick':
        // Neutral heartbeat: only escalates an already-not-ready state, never
        // manufactures one while healthy.
        if (this.ready) return { type: 'noop' }
        return this.evaluateNotReady(t)
    }
  }

  private evaluateNotReady(t: number): GcAction {
    if (this.notReadySince === undefined) this.notReadySince = t

    const deadFor = t - this.notReadySince
    if (deadFor >= this.deadExitMs) {
      return {
        type: 'exit',
        reason: `GC not ready for ${Math.round(deadFor / 1000)}s (>= ${Math.round(
          this.deadExitMs / 1000,
        )}s ceiling); exiting for a clean restart`,
      }
    }

    // Space out our relaunches so we never run two knock loops at once.
    const sinceRelaunch =
      this.lastRelaunchAt === undefined ? Number.POSITIVE_INFINITY : t - this.lastRelaunchAt
    if (sinceRelaunch >= this.relaunchIntervalMs) {
      this.lastRelaunchAt = t
      return { type: 'relaunch', reason: `GC not ready for ${Math.round(deadFor / 1000)}s` }
    }

    return { type: 'noop' }
  }
}
