'use client'
import { useState } from 'react'
import CertificateCard from '../components/CertificateCard'
import { InputField, Button } from '../components/NeonUI'
import { ethers } from 'ethers'
// correct
import { CERTIFICATE_ABI } from '../utils/abi'
import { CONTRACT_ADDRESS } from '../utils/config'

export default function VerifyPage() {
  const [id, setId] = useState('')
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleVerify() {
    setError(null)
    setResult(null)
    setLoading(true)
    try {
      const provider = new ethers.JsonRpcProvider('https://rpc-mumbai.maticvigil.com')
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CERTIFICATE_ABI, provider)
      const revoked = await contract.isRevoked(BigInt(id))
      setResult({ id, metadata: 'N/A', revoked: Boolean(revoked) })
    } catch (e: any) {
      setError(e?.message || 'Verification failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-3xl space-y-4">
      <h2 className="text-xl font-semibold">Public Verification</h2>
      <div className="p-6 rounded-2xl bg-neutral-900 shadow">
        <InputField placeholder="Certificate ID" theme="neon" value={id} onChange={e => setId(e.target.value)} />
        <Button theme="neon" className="mt-3" onClick={handleVerify}>
          {loading ? 'Checking...' : 'Verify'}
        </Button>
      </div>
      {error && <div className="text-red-500">{error}</div>}
      {result && <CertificateCard cert={result} />}
    </div>
  )
}