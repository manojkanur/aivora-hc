import { motion } from 'framer-motion'
import { cn } from '../../lib/utils'
import type { ReactNode, HTMLAttributes } from 'react'

type CardVariant = 'default' | 'elevated' | 'interactive'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant
  children: ReactNode
  className?: string
}

const variantStyles: Record<CardVariant, string> = {
  default:     'bg-[#1B2431] border border-[#2A3648] shadow-[0_1px_3px_rgba(0,0,0,0.5)]',
  elevated:    'bg-[#1B2431] border border-[#2A3648] shadow-[0_8px_32px_rgba(0,0,0,0.7)]',
  interactive: 'bg-[#1B2431] border border-[#2A3648] shadow-[0_1px_3px_rgba(0,0,0,0.5)] cursor-pointer hover:border-blue-500/30 hover:shadow-[0_4px_16px_rgba(0,0,0,0.6),0_0_0_1px_rgba(46,125,250,0.15)]',
}

export function Card({ variant = 'default', children, className, ...props }: CardProps) {
  if (variant === 'interactive') {
    return (
      <motion.div
        whileHover={{ y: -2, transition: { duration: 0.2 } }}
        className={cn('rounded-xl transition-all duration-200', variantStyles[variant], className)}
        {...(props as React.ComponentProps<typeof motion.div>)}
      >
        {children}
      </motion.div>
    )
  }

  return (
    <div className={cn('rounded-xl', variantStyles[variant], className)} {...props}>
      {children}
    </div>
  )
}

interface CardSectionProps {
  children: ReactNode
  className?: string
}

export function CardHeader({ children, className }: CardSectionProps) {
  return (
    <div className={cn('px-5 py-4 border-b border-[#2A3648]', className)}>
      {children}
    </div>
  )
}

export function CardBody({ children, className }: CardSectionProps) {
  return (
    <div className={cn('px-5 py-4', className)}>
      {children}
    </div>
  )
}

export function CardFooter({ children, className }: CardSectionProps) {
  return (
    <div className={cn('px-5 py-4 border-t border-[#2A3648] bg-[#0B1220] rounded-b-xl', className)}>
      {children}
    </div>
  )
}
