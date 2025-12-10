'use client'
import { useState } from 'react'
import { InputField, Button } from '../components/NeonUI'

export default function CreatePage() {
  const [address, setAddress] = useState('')
  const [certId, setCertId] = useState('')
  const [metadata, setMetadata] = useState('')

  return (
    <div className="max-w-xl space-y-4">
      <h2 className="text-xl font-semibold">Create Certificate</h2>
      <InputField placeholder="Recipient address (0x...)" theme="neon" value={address} onChange={e => setAddress(e.target.value)} />
      <InputField placeholder="Certificate ID" theme="neon" value={certId} onChange={e => setCertId(e.target.value)} />
      <textarea
        placeholder="Metadata or description"
        className="w-full px-3 py-2 rounded-lg bg-neutral-900 border border-indigo-600 text-white"
        value={metadata}
        onChange={e => setMetadata(e.target.value)}
      />
      <div className="flex gap-2">
        <Button theme="neon">Create On-chain</Button>
        <Button theme="neon" variant="secondary">Preview</Button>
      </div>
    </div>
  )
}