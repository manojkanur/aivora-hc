import { cn } from '../../lib/utils'

interface AivoraLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  variant?: 'full' | 'mark'
  className?: string
  inverted?: boolean
}

const sizeMap = {
  xs: { mark: 20, text: 'text-sm', gap: 'gap-1.5' },
  sm: { mark: 24, text: 'text-base', gap: 'gap-2' },
  md: { mark: 30, text: 'text-lg', gap: 'gap-2.5' },
  lg: { mark: 38, text: 'text-2xl', gap: 'gap-3' },
  xl: { mark: 48, text: 'text-3xl', gap: 'gap-3.5' },
}

function LogoMark({ size, inverted }: { size: number; inverted?: boolean }) {
  const fg = inverted ? '#0c0e14' : '#ffffff'
  const bg = inverted ? '#ffffff' : '#2563eb'

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Rounded square background */}
      <rect width="40" height="40" rx="10" fill={bg} />

      {/* "A" letterform — two diagonal strokes forming an arch with a crossbar */}
      {/* Left leg */}
      <path
        d="M9 31 L20 10 L31 31"
        stroke={fg}
        strokeWidth="3.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Crossbar */}
      <line
        x1="13.5"
        y1="23"
        x2="26.5"
        y2="23"
        stroke={fg}
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      {/* Small accent dot above apex — represents the "AI" pulse */}
      <circle cx="20" cy="7" r="2.2" fill={fg} />
    </svg>
  )
}

export function AivoraLogo({ size = 'sm', variant = 'full', className, inverted = false }: AivoraLogoProps) {
  const { mark, text, gap } = sizeMap[size]
  const textColor = inverted ? 'text-white' : 'text-white'

  if (variant === 'mark') {
    return (
      <span className={cn('inline-flex items-center', className)}>
        <LogoMark size={mark} inverted={inverted} />
      </span>
    )
  }

  return (
    <span className={cn('inline-flex items-center', gap, className)}>
      <LogoMark size={mark} inverted={inverted} />
      <span className={cn('font-bold tracking-tight leading-none', text, textColor)}>
        Aivora <span className="font-light opacity-70">HC</span>
      </span>
    </span>
  )
}
