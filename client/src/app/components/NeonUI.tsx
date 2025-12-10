'use client'
import React from 'react'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode
  variant?: 'primary' | 'secondary'
  theme?: string
}

export function Button({ children, variant = 'primary', theme = 'neon', ...props }: ButtonProps) {
  const base = "px-4 py-2 rounded-lg font-medium transition"
  const styleMap: Record<string, Record<string, string>> = {
    neon: {
      primary: base + " bg-indigo-500 text-black hover:bg-indigo-600",
      secondary: base + " border border-indigo-400 text-indigo-200 hover:bg-indigo-800/30",
    },
    glass: {
      primary: base + " bg-indigo-600 text-white shadow",
      secondary: base + " border border-white/6 text-white/80",
    },
    cyber: {
      primary: base + " bg-emerald-500 text-black",
      secondary: base + " border border-neutral-700 text-neutral-300",
    },
    proglass: {
      primary: base + " bg-indigo-500 text-black shadow-md",
      secondary: base + " border border-white/8 text-white/80",
    },
  }
  const style = styleMap[theme]?.[variant] ?? styleMap['neon'][variant]
  return (
    <button className={style} {...props}>
      {children}
    </button>
  )
}

interface InputFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  theme?: string
}

export function InputField({ theme = 'neon', ...props }: InputFieldProps) {
  const base = "w-full px-3 py-2 rounded-lg outline-none transition placeholder:opacity-60"
  const styleMap: Record<string, string> = {
    neon: base + " bg-neutral-900 border border-indigo-600 text-white placeholder:text-white/60 focus:ring-2 focus:ring-indigo-500",
    glass: base + " bg-white/5 backdrop-blur-md border border-white/8 text-white placeholder:text-white/70",
    cyber: base + " bg-neutral-800 border border-neutral-700 text-white placeholder:text-white/60",
    proglass: base + " bg-white/6 border border-white/8 text-white placeholder:text-white/70",
  }
  return <input className={styleMap[theme]} {...props} />
}