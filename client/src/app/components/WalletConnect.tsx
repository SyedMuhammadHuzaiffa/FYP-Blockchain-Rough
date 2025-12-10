// client/components/WalletConnect.tsx
'use client'
import React, { useState } from 'react'
import useWeb3 from '../lib/useWeb3'

export default function WalletConnect() {
  const { account, connect } = useWeb3() as any
  const [err, setErr] = useState<string | null>(null)

  async function handle() {
    setErr(null)
    try {
      await connect()
    } catch (e: any) {
      setErr(e?.message || 'Connect failed')
    }
  }

  return (
    <div className="flex items-center gap-3">
      {account ? (
        <div className="px-3 py-1 rounded-full bg-gray-800 text-white text-sm">
          {account.slice(0,6)}...{account.slice(-4)}
        </div>
      ) : (
        <button onClick={handle} className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm">
          Connect Wallet
        </button>
      )}
      {err && <div className="text-red-500 text-xs">{err}</div>}
    </div>
  )
}