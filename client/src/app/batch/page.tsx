'use client'
import { useState } from 'react'
import { Button } from '../components/NeonUI'

export default function BatchPage() {
  const [csv, setCsv] = useState('')

  return (
    <div className="max-w-xl space-y-4">
      <h2 className="text-xl font-semibold">Batch Issuance</h2>
      <textarea
        placeholder="0xabc...,123,Graduation 2025"
        className="w-full px-3 py-2 rounded-lg bg-neutral-900 border border-indigo-600 text-white"
        rows={4}
        value={csv}
        onChange={e => setCsv(e.target.value)}
      />
      <div className="flex gap-2">
        <Button theme="neon">Preview</Button>
        <Button theme="neon" variant="secondary">Send Batch</Button>
      </div>
    </div>
  )
}