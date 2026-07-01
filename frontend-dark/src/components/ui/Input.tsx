import { cn } from '../../lib/utils'
import type { InputHTMLAttributes, ReactNode } from 'react'
import { forwardRef } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  helperText?: string
  leftElement?: ReactNode
  rightElement?: ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, leftElement, rightElement, className, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-')

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-xs font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">
            {label}
          </label>
        )}
        <div className="relative">
          {leftElement && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
              {leftElement}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              'w-full rounded-xl border bg-[#131720] text-white placeholder:text-slate-600',
              'px-4 py-3 text-sm transition-all duration-200',
              'focus:outline-none focus:ring-1 focus:ring-blue-500/60 focus:border-blue-500/60',
              'disabled:opacity-40 disabled:cursor-not-allowed',
              error
                ? 'border-red-700/60 focus:ring-red-500/60 focus:border-red-500/60'
                : 'border-[#1e2433] hover:border-[#252d3f]',
              leftElement && 'pl-9',
              rightElement && 'pr-9',
              className
            )}
            {...props}
          />
          {rightElement && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">
              {rightElement}
            </div>
          )}
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
        {helperText && !error && <p className="text-xs text-slate-500">{helperText}</p>}
      </div>
    )
  }
)

Input.displayName = 'Input'

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  helperText?: string
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, helperText, className, id, ...props }, ref) => {
    const textareaId = id || label?.toLowerCase().replace(/\s+/g, '-')

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={textareaId} className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          className={cn(
            'w-full rounded-xl border bg-[#131720] text-white placeholder:text-slate-600',
            'px-4 py-3 text-sm transition-all duration-200 resize-none',
            'focus:outline-none focus:ring-1 focus:ring-blue-500/60 focus:border-blue-500/60',
            'disabled:opacity-40 disabled:cursor-not-allowed',
            error
              ? 'border-red-700/60 focus:ring-red-500/60'
              : 'border-[#1e2433] hover:border-[#252d3f]',
            className
          )}
          {...props}
        />
        {error && <p className="text-xs text-red-400">{error}</p>}
        {helperText && !error && <p className="text-xs text-slate-500">{helperText}</p>}
      </div>
    )
  }
)

Textarea.displayName = 'Textarea'
