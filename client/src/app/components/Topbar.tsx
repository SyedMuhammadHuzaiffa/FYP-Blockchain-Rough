// src/app/components/Topbar.tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function Topbar() {
  const [connected, setConnected] = useState(false)

  return (
    <header className="w-full border-b border-neutral-800/60 bg-neutral-900/30 p-4 flex items-center justify-between">
      <div className="flex items-center space-x-4">
        <button className="hidden md:inline-flex items-center px-2 py-1 rounded-md text-sm bg-neutral-800/60">
          Menu
        </button>

        <h1 className="text-lg font-semibold">Dashboard</h1>
        <nav className="hidden sm:flex items-center ml-4 space-x-3 text-sm text-neutral-300">
          <Link href="/dashboard" className="hover:underline">Overview</Link>
          <Link href="/revoke" className="hover:underline">Revoke</Link>
        </nav>
      </div>

      <div className="flex items-center space-x-3">
        <div className="text-sm text-neutral-300">Account</div>
        <button
          onClick={() => setConnected((s) => !s)}
          className="px-3 py-1 rounded-md text-sm bg-gradient-to-r from-neutral-700 to-neutral-600"
        >
          {connected ? 'Disconnect' : 'Connect Wallet'}
        </button>
      </div>
    </header>
  )
}