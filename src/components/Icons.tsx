import { BatteryCharging, Blocks, BookOpen, CarFront, CircleHelp, Droplets, Eclipse, Flag, House, Orbit, Sprout, Sun, Wind } from 'lucide-react'
import type { LucideProps } from 'lucide-react'
import type { BuildingId, CameraMode, Section } from '../types'

export function BuildingIcon({ id, ...props }: LucideProps & { id: BuildingId }) {
  const Icon = { command: Orbit, solar: Sun, water: Droplets, oxygen: Wind, battery: BatteryCharging, shelter: House, greenhouse: Sprout, rover: CarFront }[id]
  return <Icon strokeWidth={1.7} {...props} />
}

export function SectionIcon({ id, ...props }: LucideProps & { id: Section }) {
  const Icon = { base: Blocks, missions: Flag, forecast: Eclipse, journal: BookOpen }[id]
  return <Icon strokeWidth={1.7} {...props} />
}

export function CameraIcon({ id, ...props }: LucideProps & { id: CameraMode }) {
  const Icon = { orbit: Orbit, region: Eclipse, base: Blocks }[id]
  return <Icon strokeWidth={1.7} {...props} />
}

export function MoonMark({ className = '' }: { className?: string }) {
  return <svg className={className} viewBox="0 0 48 48" fill="none" aria-hidden="true">
    <path d="M29.7 5.4A19.8 19.8 0 1 0 40.4 33a18.6 18.6 0 0 1-10.7-27.6Z" fill="currentColor" />
    <ellipse cx="25" cy="27" rx="22" ry="7.6" transform="rotate(-32 25 27)" stroke="currentColor" strokeWidth="1.3" />
    <path d="m37 8 1.8 4.5 4.8.4-3.7 3.1 1.1 4.7-4-2.5-4.1 2.5 1.1-4.7-3.7-3.1 4.8-.4L37 8Z" fill="#8edbff" />
  </svg>
}

export const HelpIcon = CircleHelp
