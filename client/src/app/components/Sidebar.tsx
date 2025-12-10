// client/components/Sidebar.tsx
import React from 'react'
import Link from 'next/link'

export default function Sidebar({ active = 'dashboard' }: { active?: string }) {
  const items = [
    { key: 'dashboard', label: 'Dashboard', href: '/dashboard' },
    { key: 'create', label: 'Create Certificate', href: '/create' },
    { key: 'batch', label: 'Batch Issuance', href: '/batch' },
    { key: 'revoke', label: 'Revoke Certificate', href: '/revoke' },
    { key: 'verify', label: 'Verify (Public)', href: '/verify' },
  ]
  return (
    <aside className="w-64 border-r p-4 hidden lg:block">
      <div className="mb-6">
        <div className="text-xl font-bold">FYP Certificates</div>
        <div className="text-xs text-gray-500">Admin Portal</div>
      </div>
      <nav className="flex flex-col gap-2">
        {items.map(i => (
          <Link key={i.key} href={i.href} className={`px-3 py-2 rounded-lg ${active === i.key ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-100'}`}>
            {i.label}
          </Link>
        ))}
      </nav>
    </aside>
  )
}