import { createContext, useContext } from 'react'
import type { MutableRefObject } from 'react'

export interface VisualTime {
  time: number
  delta: number
  actionId: number
  actionStart: number
}

export const VisualClockContext = createContext<MutableRefObject<VisualTime> | null>(null)

export function useVisualTime() {
  const value = useContext(VisualClockContext)
  if (!value) throw new Error('VisualClockContext is missing')
  return value
}
