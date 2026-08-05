import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { SourceBadge } from './SourceBadge'

interface NetworkNode {
  id: string
  label: string
  group?: string
  size?: number
}

interface NetworkEdge {
  source: string
  target: string
  weight?: number
  kind?: 'strong' | 'weak' | 'blocked'
}

interface NetworkGraphData {
  nodes: NetworkNode[]
  edges: NetworkEdge[]
  layout?: 'force' | 'radial'
}

interface NetworkGraphProps {
  title: string
  data: NetworkGraphData & { source?: string }
  footnote?: string
}

// Categorical palette — each group gets a distinct, consistent color
const GROUP_PALETTE = [
  '#2E7DFA', // primary blue
  '#17BFA0', // AI accent teal
  '#5B96F5', // brand mid blue
  '#0D3C82', // brand deep blue
  '#8C96A6', // neutral
] as const

const DEFAULT_COLOR = '#8C96A6'

// Deterministic pseudo-random from a string seed
function seededRand(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

interface PositionedNode extends NetworkNode {
  x: number
  y: number
  color: string
  radius: number
}

function computeLayout(
  data: NetworkGraphData,
  width: number,
  height: number
): { nodes: PositionedNode[]; groupColors: Map<string, string> } {
  const cx = width / 2
  const cy = height / 2
  const layout = data.layout ?? (data.nodes.length < 12 ? 'radial' : 'force')

  // Assign group colors deterministically by first-seen order
  const groupColors = new Map<string, string>()
  let groupIdx = 0
  for (const n of data.nodes) {
    const g = n.group ?? '_default'
    if (!groupColors.has(g)) {
      groupColors.set(g, GROUP_PALETTE[groupIdx % GROUP_PALETTE.length] ?? DEFAULT_COLOR)
      groupIdx++
    }
  }

  const baseRadius = (n: NetworkNode) => {
    const s = n.size ?? 1
    return Math.max(10, Math.min(22, 10 + Math.sqrt(s) * 4))
  }

  if (layout === 'radial') {
    const R = Math.min(width, height) * 0.36
    const n = data.nodes.length
    const positioned: PositionedNode[] = data.nodes.map((node, i) => {
      const angle = (i / Math.max(1, n)) * Math.PI * 2 - Math.PI / 2
      return {
        ...node,
        x: cx + Math.cos(angle) * R,
        y: cy + Math.sin(angle) * R,
        color: groupColors.get(node.group ?? '_default') ?? DEFAULT_COLOR,
        radius: baseRadius(node),
      }
    })
    return { nodes: positioned, groupColors }
  }

  // Force-style layout — seeded deterministic simulation
  const seed = hashString(data.nodes.map(n => n.id).join('|')) || 1
  const rand = seededRand(seed)
  const positions = data.nodes.map(() => ({
    x: cx + (rand() - 0.5) * width * 0.7,
    y: cy + (rand() - 0.5) * height * 0.7,
    vx: 0,
    vy: 0,
  }))

  const idIndex = new Map(data.nodes.map((n, i) => [n.id, i]))
  const links = data.edges
    .map(e => ({ s: idIndex.get(e.source), t: idIndex.get(e.target) }))
    .filter((l): l is { s: number; t: number } => l.s !== undefined && l.t !== undefined)

  const iterations = 220
  const k = Math.sqrt((width * height) / Math.max(1, data.nodes.length)) * 0.55
  for (let iter = 0; iter < iterations; iter++) {
    const alpha = 1 - iter / iterations
    // Repulsion
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const dx = positions[i].x - positions[j].x
        const dy = positions[i].y - positions[j].y
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.01
        const force = (k * k) / dist
        const fx = (dx / dist) * force
        const fy = (dy / dist) * force
        positions[i].vx += fx
        positions[i].vy += fy
        positions[j].vx -= fx
        positions[j].vy -= fy
      }
    }
    // Attraction along edges
    for (const link of links) {
      const a = positions[link.s]
      const b = positions[link.t]
      const dx = a.x - b.x
      const dy = a.y - b.y
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01
      const force = (dist * dist) / k
      const fx = (dx / dist) * force
      const fy = (dy / dist) * force
      a.vx -= fx
      a.vy -= fy
      b.vx += fx
      b.vy += fy
    }
    // Apply velocity + center gravity
    const maxStep = 12 * alpha
    for (const p of positions) {
      const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy) || 0.01
      const step = Math.min(maxStep, speed)
      p.x += (p.vx / speed) * step
      p.y += (p.vy / speed) * step
      p.x += (cx - p.x) * 0.02 * alpha
      p.y += (cy - p.y) * 0.02 * alpha
      p.vx *= 0.7
      p.vy *= 0.7
      // Bounds
      p.x = Math.max(28, Math.min(width - 28, p.x))
      p.y = Math.max(28, Math.min(height - 28, p.y))
    }
  }

  const positioned: PositionedNode[] = data.nodes.map((node, i) => ({
    ...node,
    x: positions[i].x,
    y: positions[i].y,
    color: groupColors.get(node.group ?? '_default') ?? DEFAULT_COLOR,
    radius: baseRadius(node),
  }))
  return { nodes: positioned, groupColors }
}

function edgeStroke(kind: NetworkEdge['kind']) {
  switch (kind) {
    case 'blocked':
      return { stroke: '#D14343', dash: '4 4', opacity: 0.85 }
    case 'weak':
      return { stroke: '#8C96A6', dash: '3 5', opacity: 0.55 }
    default:
      return { stroke: '#2E7DFA', dash: undefined, opacity: 0.7 }
  }
}

export function networkgraph({ title, data, footnote }: NetworkGraphProps) {
  const width = 720
  const height = 460

  const { nodes, groupColors } = useMemo(
    () => computeLayout(data, width, height),
    [data]
  )

  const nodeById = useMemo(() => {
    const m = new Map<string, PositionedNode>()
    for (const n of nodes) m.set(n.id, n)
    return m
  }, [nodes])

  const weights = data.edges.map(e => e.weight ?? 1)
  const maxW = Math.max(1, ...weights)
  const minW = Math.min(1, ...weights)

  const legendGroups = Array.from(groupColors.entries()).filter(([g]) => g !== '_default')

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="rounded-2xl border border-[#222E3E] bg-[#1B2431] p-5 sm:p-6"
    >
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          {title && <h3 className="text-base sm:text-lg font-semibold text-white">{title}</h3>}
          <SourceBadge source={data?.source} footnote={footnote} />
        </div>
        {legendGroups.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {legendGroups.map(([group, color]) => (
              <div key={group} className="flex items-center gap-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span className="text-[11px] text-slate-400 capitalize">
                  {group.replace(/[-_]/g, ' ')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="w-full overflow-hidden rounded-xl border border-[#2A3648] bg-[#0B1220]">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto"
          role="img"
          aria-label={title}
        >
          <defs>
            <radialGradient id="ng-node-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Edges */}
          <g>
            {data.edges.map((edge, i) => {
              const s = nodeById.get(edge.source)
              const t = nodeById.get(edge.target)
              if (!s || !t) return null
              const w = edge.weight ?? 1
              const norm = maxW === minW ? 0.5 : (w - minW) / (maxW - minW)
              const strokeWidth = 0.8 + norm * 2.6
              const { stroke, dash, opacity } = edgeStroke(edge.kind)
              const mx = (s.x + t.x) / 2
              const my = (s.y + t.y) / 2
              const dx = t.x - s.x
              const dy = t.y - s.y
              const dist = Math.sqrt(dx * dx + dy * dy) || 1
              // Perpendicular offset for curve
              const curveOffset = Math.min(40, dist * 0.15)
              const nx = -dy / dist
              const ny = dx / dist
              const sign = (i % 2 === 0 ? 1 : -1)
              const ctrlX = mx + nx * curveOffset * sign
              const ctrlY = my + ny * curveOffset * sign
              return (
                <motion.path
                  key={`${edge.source}->${edge.target}-${i}`}
                  d={`M ${s.x} ${s.y} Q ${ctrlX} ${ctrlY} ${t.x} ${t.y}`}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={strokeWidth}
                  strokeOpacity={opacity}
                  strokeDasharray={dash}
                  strokeLinecap="round"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity }}
                  transition={{ duration: 0.6, delay: 0.15 + i * 0.015, ease: 'easeOut' }}
                />
              )
            })}
          </g>

          {/* Nodes */}
          <g>
            {nodes.map((n, i) => {
              const labelOffset = n.radius + 12
              return (
                <motion.g
                  key={n.id}
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.35, delay: 0.05 + i * 0.025, ease: 'easeOut' }}
                  style={{ transformOrigin: `${n.x}px ${n.y}px` }}
                >
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={n.radius + 6}
                    fill="url(#ng-node-glow)"
                  />
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={n.radius}
                    fill={n.color}
                    fillOpacity={0.18}
                    stroke={n.color}
                    strokeWidth={1.8}
                  />
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={n.radius * 0.35}
                    fill={n.color}
                  />
                  <text
                    x={n.x}
                    y={n.y + labelOffset}
                    textAnchor="middle"
                    fontSize="11"
                    fontWeight={500}
                    fill="#e2e8f0"
                    style={{ paintOrder: 'stroke', stroke: '#0B1220', strokeWidth: 3 }}
                  >
                    {n.label}
                  </text>
                </motion.g>
              )
            })}
          </g>
        </svg>
      </div>

      {/* Edge kind legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3">
        <div className="flex items-center gap-1.5">
          <svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" stroke="#2E7DFA" strokeWidth="2" strokeLinecap="round" /></svg>
          <span className="text-[11px] text-slate-400">Strong</span>
        </div>
        <div className="flex items-center gap-1.5">
          <svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" stroke="#8C96A6" strokeWidth="2" strokeDasharray="3 5" strokeLinecap="round" /></svg>
          <span className="text-[11px] text-slate-400">Weak</span>
        </div>
        <div className="flex items-center gap-1.5">
          <svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" stroke="#D14343" strokeWidth="2" strokeDasharray="4 4" strokeLinecap="round" /></svg>
          <span className="text-[11px] text-slate-400">Blocked</span>
        </div>
        <div className="ml-auto text-[11px] text-slate-500 tabular-nums">
          {data.nodes.length} nodes · {data.edges.length} edges
        </div>
      </div>

      {footnote && (
        <p className="text-xs text-slate-500 mt-3 leading-relaxed">{footnote}</p>
      )}
    </motion.div>
  )
}
