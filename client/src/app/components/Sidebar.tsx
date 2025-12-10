// src/app/components/Sidebar.tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export interface SidebarLink {
  href: string
  label: string
}

interface SidebarProps {
  links: SidebarLink[]
}

export default function Sidebar({ links }: SidebarProps) {
  const pathname = usePathname() || '/'

  return (
    <aside className="w-64 border-r border-neutral-800/60 bg-neutral-900/40 text-white sticky top-0 h-screen p-4">
      <div className="mb-6 px-2">
        <div className="text-lg font-semibold">FYP Certificates</div>
        <div className="text-xs text-neutral-300 mt-1">Admin dashboard</div>
      </div>

      <nav className="flex-1">
        <ul className="space-y-1">
          {links.map((l) => {
            const active = pathname === l.href
            return (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className={
                    'block px-3 py-2 rounded-lg text-sm ' +
                    (active ? 'bg-neutral-700 text-white font-medium' : 'text-neutral-200 hover:bg-neutral-800/60')
                  }
                >
                  {l.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="mt-6 px-2">
        <div className="text-xs text-neutral-400">Version</div>
        <div className="text-sm text-neutral-200">phase-1</div>
      </div>
    </aside>
  )
}