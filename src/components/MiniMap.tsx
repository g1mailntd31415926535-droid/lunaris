import { BUILDINGS } from '../data'
import type { BuildingId } from '../types'

export function MiniMap({ selected, onSelect, hour = 0, variant = 'base' }: { selected?: BuildingId; onSelect?: (id: BuildingId) => void; hour?: number; variant?: 'base' | 'forecast' }) {
  const id = `map-${variant}`
  return <div className={`mini-map mini-map-${variant}`} aria-label="Bản đồ minh họa căn cứ Artemis">
    <svg viewBox="0 0 280 153" fill="none" aria-hidden="true">
      <defs>
        <radialGradient id={`${id}-ground`}><stop stopColor="#9290a7" /><stop offset=".68" stopColor="#68677f" /><stop offset="1" stopColor="#45485e" /></radialGradient>
        <radialGradient id={`${id}-crater`}><stop stopColor="#383b53" /><stop offset=".7" stopColor="#45485d" /><stop offset=".84" stopColor="#9790a6" /><stop offset="1" stopColor="#696a81" /></radialGradient>
        <clipPath id={`${id}-clip`}><ellipse cx="140" cy="79" rx="122" ry="68" /></clipPath>
      </defs>
      <g opacity=".18" stroke="#c2cced"><ellipse cx="140" cy="80" rx="133" ry="72" strokeDasharray="2 5" /><path d="M0 79h280M140 0v153" strokeDasharray="2 6" /></g>
      <g clipPath={`url(#${id}-clip)`}>
        <ellipse cx="140" cy="79" rx="122" ry="68" fill={`url(#${id}-ground)`} />
        {[ [61, 59, 19, 11], [219, 103, 21, 13], [79, 119, 19, 10], [189, 31, 17, 8], [34, 92, 12, 9] ].map(([x, y, rx, ry], i) => <ellipse key={i} cx={x} cy={y} rx={rx} ry={ry} fill={`url(#${id}-crater)`} />)}
        <path d="m38 44 14-26 22 14 13-20 17 18-8 19-23 9-20-7Z" fill="#aba3b5" /><path d="m52 18 7 28 15-14-12 22-24-10Z" fill="#5d5c78" />
        <path d="m232 57-13-31-12 15-8-8-16 25 16 12 14-4Z" fill="#a09bb0" /><path d="m219 26 1 31 12 0-19 9-14-25Z" fill="#585b75" />
        <path d="M98 55h38l-5 29 34 27 54-3M84 80l43-1M107 118l24-34M192 71l-39 8" stroke="#c6c7d1" strokeWidth="1.3" strokeDasharray="3 3" opacity=".48" />
        <g transform="translate(81 59) rotate(-9)" fill="#244878" stroke="#9aa5c5" strokeWidth=".6">{[0, 10, 20].map((x) => <g key={x}><rect x={x} y="0" width="8" height="9" /><rect x={x} y="12" width="8" height="9" /></g>)}</g>
        <ellipse cx="132" cy="76" rx="20" ry="14" fill="#42465d" /><path d="M112 75c0-27 40-27 40 0Z" fill="#c2bccc" /><ellipse cx="132" cy="65" rx="9" ry="3" stroke="#8d879e" /><rect x="126" y="73" width="10" height="7" rx="1" fill="#ffd79b" />
        <rect x="94" y="88" width="17" height="14" rx="3" fill="#b0a9be" /><rect x="99" y="91" width="7" height="7" fill="#ffd075" />
        <g fill="#c3bfce"><rect x="164" y="48" width="10" height="21" rx="5" /><rect x="176" y="52" width="9" height="17" rx="4" /></g><g fill="#84cca2"><rect x="164" y="53" width="10" height="7" /><rect x="176" y="56" width="9" height="7" /></g>
        <path d="M179 94c-8-27 32-27 28 0Z" fill="#59876d" stroke="#c7bece" strokeWidth="1.5" /><path d="M190 74v21m-9-11h21" stroke="#c7bece" />
        <rect x="137" y="108" width="15" height="14" rx="2" fill="#b1adbf" /><rect x="129" y="106" width="8" height="15" rx="3" fill="#56b4d9" /><rect x="140" y="109" width="9" height="6" fill="#68d3f4" />
        <path d="M103 126c-1-19 24-19 24 0Z" fill="#c8bed0" /><rect x="114" y="116" width="3" height="6" fill="#ffa89a" /><rect x="112" y="118" width="7" height="2" fill="#ffa89a" />
        <rect x="193" y="113" width="21" height="14" rx="3" fill="#b7b0c6" /><path d="M197 125v-7h13v7" stroke="#ffcc93" strokeWidth="2" />
        <path d={`M-30-5H130L${92 + hour * 12} 153H-30Z`} fill="#141e3f" opacity={variant === 'forecast' ? 0.1 + hour * 0.057 : 0.16} style={{ transition: 'd .5s, opacity .5s' }} />
      </g>
      <path d="m254 13 0 14m-4-10 4-4 4 4" stroke="#a9b4d3" strokeWidth="1" /><text x="254" y="37" textAnchor="middle" fill="#9ca9cc" fontSize="7" fontFamily="sans-serif">N</text>
      <circle cx="132" cy="76" r="38" stroke="#97b3db" opacity=".25" strokeWidth=".7" strokeDasharray="3 4" />
      <path d="M13 140h26m-26-3v6m26-6v6" stroke="#a1aecb" strokeWidth="1" /><text x="44" y="143" fill="#96a3c3" fontSize="7" fontFamily="sans-serif">50 m · minh họa</text>
    </svg>
    {onSelect && BUILDINGS.map((building) => {
      const positions = { command: [47, 45], solar: [34, 42], water: [50, 76], oxygen: [62, 40], battery: [36, 64], shelter: [41, 84], greenhouse: [69, 59], rover: [73, 79] }
      const [x, y] = positions[building.id]
      return <button key={building.id} className={`map-dot ${selected === building.id ? 'selected' : ''}`} style={{ left: `${x}%`, top: `${y}%`, color: building.accent }} aria-label={`Chọn ${building.name}`} data-tooltip={building.shortName} onClick={() => onSelect(building.id)}><span /></button>
    })}
    {variant === 'forecast' && <span className="map-preview-tag">XEM TRƯỚC · +{hour}H</span>}
  </div>
}
