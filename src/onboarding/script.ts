// Onboarding script: every line the mascot (Basic) or the captions (Advanced) say, in one place.
// Presentation only: nothing here changes the simulation. The game itself starts after the last step.
import type { Expression } from './mascotFace'
type RobotMood = 'idle' | Expression

export type HudItem = 'battery' | 'water' | 'oxygen' | 'food'
export type CameraCue = 'base' | 'tour' | 'solar' | 'crew'
export interface TourStep {
  id: string
  lines: string[]
  mood?: RobotMood
  /** HUD items shown from this step on (they appear in order and stay). */
  reveal?: HudItem[]
  /** Items glowing while this step is on screen (cycled one after another if several). */
  highlight?: HudItem[]
  /** Camera cue when the step starts ('tour' runs after the last line, then the next step starts by itself). */
  camera?: CameraCue
  /** The player may look around freely; the step waits for "Tiếp tục". */
  explore?: boolean
  crewGreeting?: boolean
}

export const WELCOME = {
  title: 'LUNARIS',
  lines: ['Welcome to your journey of lunar discovery.', 'You will become the commander of a research base at the Moon’s South Pole.', 'Your decisions will shape the future of the whole mission.'],
}

export const MODES = {
  basic: { title: 'Basic', lines: ['For new players.', 'A robot assistant guides you step by step.', 'Time pauses whenever a decision is needed.'] },
  advanced: { title: 'Advanced', lines: ['Run the base yourself, with no assistant.', 'Time does not pause on its own.', 'Every decision still explains its risks and results.'] },
}

export const BASIC_TOUR: TourStep[] = [
  { id: 'hello', mood: 'happy', camera: 'base', lines: ['Hello, Commander!', 'Welcome to Artemis Base!', 'This will be our home and workplace on the Moon.'] },
  { id: 'place', camera: 'tour', lines: ['We are at the South Pole of the Moon.', 'From here we will run the base, do research and explore new lands.'] },
  { id: 'explore', explore: true, lines: ['Try rotating and zooming to take a look around our base.'] },
  { id: 'power', camera: 'solar', reveal: ['battery'], highlight: ['battery'], lines: ['First, power!', 'Electricity keeps the base systems running, from cleaning water to making oxygen.', 'Energy is not unlimited, so we must use it wisely!'] },
  { id: 'water', camera: 'base', reveal: ['water'], highlight: ['water'], lines: ['Next, water!', 'Water matters for daily life, for research and for many life support systems.', 'We can recycle water, but that takes energy and working equipment.'] },
  { id: 'oxygen', reveal: ['oxygen'], highlight: ['oxygen'], lines: ['And this is oxygen!', 'Oxygen lets the astronauts breathe and keeps everyone alive in the base.', 'We can make oxygen from water by electrolysis, but that uses both water and power.'] },
  { id: 'links', highlight: ['battery', 'water', 'oxygen'], lines: ['See? Power, water and oxygen are closely linked.', 'A decision today can change what we are able to do later.'] },
  { id: 'food', reveal: ['food'], highlight: ['food'], lines: ['We also need to manage the astronauts’ food.', 'This number is how many days the food brought from Earth will last. When it runs low, the mission must end.', 'The greenhouse plants are for research, to prepare for longer missions in the future.'] },
  { id: 'crew', camera: 'crew', crewGreeting: true, mood: 'happy', lines: ['Of course, you will not have to do everything alone!', 'Meet the astronaut crew, the teammates who will explore the Moon with you!', 'Kai, Linh, Leo and Mia: each has a specialty, and together they do research and run the base.'] },
  { id: 'go', camera: 'base', crewGreeting: true, mood: 'happy', lines: ['I will be down here in the corner and remind you when needed.', 'Everyone is ready, Commander! How about you?', 'Then let’s begin the first mission. Are you ready?'] },
]

/** Advanced: short captions, no mascot, no step-by-step resource lesson. */
export const ADVANCED_TOUR: TourStep[] = [
  { id: 'arrive', camera: 'tour', lines: ['Artemis Base · lunar South Pole · NASA LOLA terrain'] },
  { id: 'hud', reveal: ['battery', 'water', 'oxygen', 'food'], highlight: ['battery', 'water', 'oxygen', 'food'], lines: ['Power · water · oxygen (%) and days of food from Earth. Every decision has consequences.'] },
]

/** Basic gameplay: the mascot keeps one short hint (lines come from components/Story.tsx lunaHint). */
export const MASCOT_NAME = 'LUNA-01'

/**
 * Research briefings (shown before the branch starts; the branch's first event fires only after the button).
 * The mascot introduces the goal and how to interact; it never hints at the "right" answer.
 */
export interface Briefing { id: 'food' | 'ice'; camera: ('greenhouse' | 'rover' | 'map')[]; lines: string[]; start: string; caption: string }
export const BRIEFINGS: Record<'food' | 'ice', Briefing> = {
  food: {
    id: 'food', camera: ['greenhouse', 'greenhouse', 'greenhouse'], start: 'START RESEARCH',
    lines: [
      'This is the research greenhouse. The plants were planted earlier and grow a little every day.',
      'Your job: watch the plants, keep them watered and lit, then weigh a sample when they are big enough.',
      'If something goes wrong in the greenhouse, I will tell you so you can decide what to do.',
    ],
    caption: 'Food research: watch the plants, handle problems, harvest and report.',
  },
  ice: {
    id: 'ice', camera: ['rover', 'map', 'map'], start: 'START EXPLORING',
    lines: [
      'This is MILO, the base’s exploration rover. MILO carries instruments to look for signs of water ice.',
      'At the South Pole there are deep craters that never see sunlight, called permanently shadowed regions. They are so cold that ice may survive there.',
      'First you will choose a research zone on the map, then plan the route. Rotate and zoom the map to look around.',
    ],
    caption: 'Ice survey: choose a research zone on the NASA map, then a route for MILO the rover.',
  },
}
