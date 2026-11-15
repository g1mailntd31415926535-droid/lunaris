import type { GameState } from './types.ts'
import { SAVE_SCHEMA_VERSION } from './scenario.ts'
import { clampResources } from './reducer.ts'

// Local-only save. Works offline; nothing leaves the browser.
export const SAVE_KEY = 'lunaris.story.save'

export interface KeyValueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export type LoadResult =
  | { status: 'loaded'; state: GameState }
  | { status: 'empty' | 'incompatible' | 'corrupt' | 'unavailable' }

interface SaveFile { schemaVersion: number; savedAt: string; state: GameState }

export function saveGame(state: GameState, storage: KeyValueStorage | null): boolean {
  if (!storage) return false
  try {
    const file: SaveFile = { schemaVersion: SAVE_SCHEMA_VERSION, savedAt: new Date().toISOString(), state }
    storage.setItem(SAVE_KEY, JSON.stringify(file))
    return true
  } catch { return false }
}

function isGameState(value: unknown): value is GameState {
  const s = value as GameState
  return !!s && typeof s === 'object' && s.version === SAVE_SCHEMA_VERSION && typeof s.stage === 'string' && !!s.resources && !!s.clock && typeof s.clock.elapsedMinutes === 'number' && !!s.food && !!s.ice && Array.isArray(s.decisions) && Array.isArray(s.history) && Array.isArray(s.log) && Array.isArray(s.inbox)
}

export function loadGame(storage: KeyValueStorage | null): LoadResult {
  if (!storage) return { status: 'unavailable' }
  let raw: string | null
  try { raw = storage.getItem(SAVE_KEY) } catch { return { status: 'unavailable' } }
  if (!raw) return { status: 'empty' }
  try {
    const file = JSON.parse(raw) as SaveFile
    if (file.schemaVersion !== SAVE_SCHEMA_VERSION) return { status: 'incompatible' }
    if (!isGameState(file.state)) return { status: 'corrupt' }
    // A saved file is never trusted to be inside capacity.
    return { status: 'loaded', state: { ...file.state, resources: clampResources(file.state.resources) } }
  } catch { return { status: 'corrupt' } }
}

export function clearSave(storage: KeyValueStorage | null) {
  try { storage?.removeItem(SAVE_KEY) } catch { /* storage blocked: nothing to clear */ }
}

export function browserStorage(): KeyValueStorage | null {
  try { return typeof window !== 'undefined' ? window.localStorage : null } catch { return null }
}
