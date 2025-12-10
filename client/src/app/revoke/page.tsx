'use client'
import { useState } from 'react'
import { InputField, Button } from '../components/NeonUI'

export default function RevokePage() {
  const [certId, setCertId] = useState('')

  return (
    <div className="max-w-xl space-y-4">
      <h2 className="text-xl font-semibold">Revoke Certificate</h2>
      <InputField placeholder="Certificate ID" theme="neon" value={certId} onChange={e => setCertId(e.target.value)} />
      <Button theme="neon">Revoke</Button>
    </div>
  )
}