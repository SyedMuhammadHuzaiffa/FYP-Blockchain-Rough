// client/components/Topbar.tsx
import React from 'react'
import WalletConnect from './WalletConnect'

export default function Topbar({ title = 'Admin Dashboard' }: { title?: string }) {
  return (
    <header className="flex items-center justify-between px-6 py-4 border-b bg-neutral-900 backdrop-blur">
      <div className="flex items-center gap-4">
        <button className="lg:hidden p-2 rounded-md">☰</button>
        <h1 className="text-lg font-semibold">{title}</h1>
      </div>
      <div className="flex items-center gap-3">
        <WalletConnect />
      </div>
    </header>
  )
}