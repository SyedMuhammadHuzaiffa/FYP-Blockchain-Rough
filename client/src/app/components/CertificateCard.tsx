// client/components/CertificateCard.tsx
import React from 'react'

export default function CertificateCard({ cert }: { cert: any }) {
  return (
    <div className="p-4 rounded-2xl bg-neutral-900 shadow">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-gray-500">Certificate ID</div>
          <div className="font-medium">{String(cert?.id ?? '—')}</div>
        </div>
        <div>
          {cert?.revoked ? <span className="inline-flex items-center px-3 py-1 rounded-full bg-red-600 text-white text-xs">Revoked</span> :
            <span className="inline-flex items-center px-3 py-1 rounded-full bg-green-600 text-white text-xs">Valid</span>}
        </div>
      </div>
      <div className="mt-3 text-sm text-gray-600">{cert?.metadata ?? 'No metadata'}</div>
    </div>
  )
}