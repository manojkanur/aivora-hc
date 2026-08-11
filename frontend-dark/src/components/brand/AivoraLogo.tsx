import { cn } from '../../lib/utils'
import { useThemeStore } from '../../store/theme'

interface AivoraLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  variant?: 'full' | 'mark'
  className?: string
  /** Force light-surface rendering (blue ink). Overrides the automatic theme choice. */
  inverted?: boolean
  /** Force a specific fill instead of the theme colour (e.g. 'currentColor'). */
  color?: string
}

// Logotype (AIVORA wordmark) native ratio 1060x452 ≈ 2.35:1.
// Logomark (AIV) native ratio 792x525 ≈ 1.51:1.
const sizeMap = {
  xs: { markH: 20, wordH: 15 },
  sm: { markH: 24, wordH: 18 },
  md: { markH: 30, wordH: 23 },
  lg: { markH: 38, wordH: 29 },
  xl: { markH: 48, wordH: 37 },
}

// Brand blue for light surfaces; white for dark surfaces (brand guideline "Logo On Color").
const BRAND_BLUE = '#0060FF'

/** AIV logomark — the three angled strokes. Real brand geometry. */
function LogoMark({ height, fill }: { height: number; fill: string }) {
  const width = Math.round((height * 792) / 525)
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 792 525"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M348.402 350H316.27V218.516L214.484 350H174L309.464 175H348.402V350Z" fill={fill} />
      <path d="M411.289 350H379.156V175H411.289V350Z" fill={fill} />
      <path d="M475.74 306.484L577.517 175H618L482.536 350H443.607V175H475.74V306.484Z" fill={fill} />
    </svg>
  )
}

/** AIVORA logotype — the full wordmark. Real brand geometry. */
function LogoType({ height, fill }: { height: number; fill: string }) {
  const width = Math.round((height * 1060) / 452)
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 1060 452"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="AIVORA"
    >
      <path
        d="M317.137 152.228H343.958V299.74H317.137V152.228ZM258.967 152.228L145.898 299.74H179.689L264.639 188.908V299.74H291.46V152.228H258.959H258.967ZM914.115 152.228V299.74H887.294V188.908L802.344 299.74H760.604L714.962 240.19H690.664V299.74H663.843V152.228L747.749 152.269C771.99 152.269 791.709 171.988 791.709 196.229C791.709 220.47 772.52 239.635 748.736 240.165L781.482 282.877L881.63 152.22H914.123L914.115 152.228ZM747.74 211.778C756.311 211.778 763.289 204.808 763.289 196.229C763.289 187.651 756.319 180.681 747.74 180.681H690.655V211.778H747.74ZM481.406 152.228L396.456 263.06V152.228H369.635V299.74H402.137L515.205 152.228H481.414H481.406ZM645.454 226.004C645.454 267.859 612.822 301.911 572.714 301.911C532.606 301.911 499.975 267.859 499.975 226.004C499.975 184.15 532.606 150.098 572.714 150.098C612.822 150.098 645.454 184.15 645.454 226.004ZM617.042 226.004C617.042 199.812 597.16 178.51 572.714 178.51C548.269 178.51 528.386 199.821 528.386 226.004C528.386 252.188 548.269 273.499 572.714 273.499C597.16 273.499 617.042 252.188 617.042 226.004Z"
        fill={fill}
      />
    </svg>
  )
}

export function AivoraLogo({
  size = 'sm',
  variant = 'full',
  className,
  inverted,
  color,
}: AivoraLogoProps) {
  const { markH, wordH } = sizeMap[size]
  const themeMode = useThemeStore(s => s.mode)
  // Automatic contrast: blue ink on light surfaces, white on dark surfaces.
  // `inverted` forces blue; `color` overrides everything.
  const onLight = inverted ?? themeMode === 'light'
  const fill = color ?? (onLight ? BRAND_BLUE : '#FFFFFF')

  if (variant === 'mark') {
    return (
      <span className={cn('inline-flex items-center', className)}>
        <LogoMark height={markH} fill={fill} />
      </span>
    )
  }

  return (
    <span className={cn('inline-flex items-center', className)}>
      <LogoType height={wordH} fill={fill} />
    </span>
  )
}
