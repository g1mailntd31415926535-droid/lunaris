import type { BuildingData, BuildingId, CameraMode, Section } from './types'

// This is an authored presentation plan, not a resource economy or scientific site.
// Scene convention: right-handed, +Y up, front of a building = +Z, 1 unit ≈ 1 m.
export const BUILDINGS: BuildingData[] = [
  { id: 'command', name: 'Command Center', shortName: 'Command', code: 'CMD–01', category: 'HEART OF THE BASE', accent: '#b8a0ff', position: [-0.8, 0, -2], radius: 3.05, description: 'A small home that connects big discoveries.', fact: 'A signal from the Moon takes about 1.3 seconds to reach Earth.', action: 'Send a signal to Earth', metric: 'Earth link', unit: '%', value: 98 },
  { id: 'solar', name: 'Power Station', shortName: 'Power', code: 'SOL–02', category: 'CLEAN ENERGY', accent: '#ffd75e', position: [-9, 0, -5.2], radius: 3.1, description: 'Catches sunlight to light up our home on the Moon.', fact: 'One day on the Moon lasts almost 29.5 Earth days.', action: 'Clean the solar panels', metric: 'Panel efficiency', unit: '%', value: 86 },
  { id: 'water', name: 'Water Recycling Station', shortName: 'Water recycling', code: 'H₂O–03', category: 'EVERY DROP COUNTS', accent: '#59c9ff', position: [1.2, 0, 6.6], radius: 2.15, description: 'Turns used water back into clean water for the whole base.', fact: 'On the ISS, the system can recover about 98% of the water.', action: 'Boost production', metric: 'Water in tank', unit: '%', value: 56 },
  { id: 'oxygen', name: 'Life Support Station', shortName: 'Life support', code: 'O₂–04', category: 'A BREATH OF FRESH AIR', accent: '#5edc88', position: [5.5, 0, -5.7], radius: 1.75, description: 'Clean air that keeps our explorers healthy.', fact: 'Electricity can split water into hydrogen and oxygen. This is called electrolysis.', action: 'Check the air', metric: 'Oxygen reserve', unit: '%', value: 68 },
  { id: 'battery', name: 'Battery Station', shortName: 'Battery', code: 'BAT–05', category: 'SAVED ENERGY', accent: '#ffd75e', position: [-7.4, 0, 2.6], radius: 1.9, description: 'Stores today’s sunlight for the dark hours ahead.', fact: 'Mountain shadows at the South Pole can be very long because the Sun always stays low on the horizon.', action: 'Charge the battery', metric: 'Battery charge', unit: '%', value: 72 },
  { id: 'shelter', name: 'Crew Habitat', shortName: 'Habitat', code: 'HAB–06', category: 'SAFE & WARM', accent: '#ff9d8d', position: [-4.8, 0, 7.7], radius: 1.85, description: 'A cosy place to rest, and a shelter during radiation storms.', fact: 'Moon soil can help shield the base from space radiation.', action: 'Shelter drill', metric: 'Shielding', unit: '%', value: 94 },
  { id: 'greenhouse', name: 'Space Garden', shortName: 'Greenhouse', code: 'BIO–07', category: 'GREEN SPROUTS ON THE MOON', accent: '#a5e887', position: [8, 0, 0.2], radius: 2.65, description: 'The first green sprouts, growing under a starry dome.', fact: 'Plants in space still need light, water and nutrients.', action: 'Tend the garden', metric: 'Greenhouse humidity', unit: '%', value: 78 },
  { id: 'rover', name: 'Rover Station', shortName: 'Rover', code: 'ROV–08', category: 'ONE SMALL STEP AT A TIME', accent: '#ffc67e', position: [8.6, 0, 7.6], radius: 2.2, description: 'Meet MILO, a small rover on a big journey of discovery.', fact: 'Rovers can explore places that are too dangerous for people.', action: 'Ride along with MILO', metric: 'MILO battery', unit: '%', value: 89 },
]

export const BUILDING_BY_ID = Object.fromEntries(BUILDINGS.map((item) => [item.id, item])) as Record<BuildingId, BuildingData>

export const NAVIGATION: { id: Section; label: string; tooltip: string; key: string }[] = [
  { id: 'base', label: 'Base', tooltip: 'Your base', key: 'B' },
  { id: 'missions', label: 'Missions', tooltip: 'Your discoveries', key: 'M' },
  { id: 'forecast', label: 'Forecast', tooltip: 'A look ahead', key: 'F' },
  { id: 'journal', label: 'Journal', tooltip: 'Science notebook', key: 'J' },
]

export const CAMERA_MODES: { id: CameraMode; label: string; key: string; scale: string }[] = [
  { id: 'orbit', label: 'Moon', key: '1', scale: '1,737 km' },
  { id: 'region', label: 'Region', key: '2', scale: '500 m' },
  { id: 'base', label: 'Base', key: '3', scale: '50 m' },
]

export const FORECASTS = [
  { hour: 0, title: 'Sunny at the base', description: 'The panels are catching sunlight. A great time to explore!', power: 86, light: 'Soft sunlight', color: '#ffd75e' },
  { hour: 2, title: 'A mountain shadow is coming', description: 'The shadow of the ridge will slowly reach the power station.', power: 65, light: 'Mountain shadow', color: '#ffd75e' },
  { hour: 4, title: 'Less light', description: 'The power station is moving into shadow. The battery will be very useful.', power: 38, light: 'Twilight', color: '#b8a0ff' },
  { hour: 8, title: 'A quiet night', description: 'The base is lit by the energy it saved.', power: 12, light: 'Dark', color: '#8fa9ff' },
]

export const MISSIONS = [
  { id: 'first-home', number: '01', name: 'A Home on the Moon', subtitle: 'Get to know Artemis Base', progress: 3, total: 4, reward: 'New Explorer', color: '#b8a0ff', tasks: ['Explore the command center', 'Meet the crew', 'Visit the power station', 'Try recycling water'] },
  { id: 'sunlight', number: '02', name: 'Saving a Ray of Sunshine', subtitle: 'Explore light and mountain shadows', progress: 1, total: 3, reward: 'Friend of the Sun', color: '#ffd75e', tasks: ['Open the forecast', 'See the shadows 4 hours later', 'Charge the battery'] },
  { id: 'milo', number: '03', name: 'MILO and the New Land', subtitle: 'Follow a robot friend', progress: 0, total: 2, reward: 'MILO’s Teammate', color: '#59c9ff', tasks: ['Visit the rover station', 'Send MILO exploring'] },
]

export const JOURNAL = [
  { id: 'moon', tag: 'THE MOON', title: 'Why are some places always dark?', text: 'At the South Pole the Sun stays very low. Mountains and crater rims cast long shadows. Some crater floors have never received direct sunlight!', extra: 'These dark places may hold water ice — a precious resource for future bases.', color: '#b8a0ff' },
  { id: 'water', tag: 'LIFE', title: 'One drop, many journeys', text: 'On a space station, water is never used just once. Filters clean the used water so the astronauts can use it again.', extra: 'Recovering water means less has to be launched from Earth into space.', color: '#59c9ff' },
  { id: 'earth', tag: 'DISCOVERY', title: 'Our blue home from far away', text: 'From the Moon, Earth looks much bigger than the Moon does in our sky. The average distance is 384,400 km.', extra: 'The Earth in this scene is a 3D sphere. Its continents and clouds are drawn by code, not taken from satellite images.', color: '#5edc88' },
]
