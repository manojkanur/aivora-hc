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
  default: 'bg-white border border-border shadow-card',
  elevated: 'bg-white border border-border shadow-elevated',
  interactive: 'bg-white border border-border shadow-card cursor-pointer hover:shadow-card-hover hover:border-border-dark',
}

export function Card({ variant = 'default', children, className, ...props }: CardProps) {
  if (variant === 'interactive') {
    return (
      <motion.div
        whileHover={{ y: -4, transition: { duration: 0.2 } }}
        className={cn('rounded-xl transition-shadow', variantStyles[variant], className)}
        {...(props as React.ComponentProps<typeof motion.div>)}
      >
        {children}
      </motion.div>
    )
  }

  return (
    <div
      className={cn('rounded-xl', variantStyles[variant], className)}
      {...props}
    >
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
    <div className={cn('px-5 py-4 border-b border-border', className)}>
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
    <div className={cn('px-5 py-4 border-t border-border bg-surface-secondary rounded-b-xl', className)}>
      {children}
    </div>
  )
}
