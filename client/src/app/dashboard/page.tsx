'use client'
import CertificateCard from '../components/CertificateCard'
import { useState } from 'react'
import { InputField, Button } from '../components/NeonUI'

export default function DashboardPage() {
  const demoCert = { id: 12345, metadata: 'BSc Software Engineering — Fall 2025', revoked: false }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <div className="p-6 rounded-2xl bg-gradient-to-br from-purple-800 to-indigo-600 shadow">
          <div className="text-sm opacity-70">Total Issued</div>
          <div className="text-2xl font-bold">1,234</div>
        </div>
        <div className="p-6 rounded-2xl bg-gradient-to-br from-purple-900 to-indigo-700 shadow">
          <div className="text-sm opacity-70">Revoked</div>
          <div className="text-2xl font-bold">12</div>
        </div>
        <div className="p-6 rounded-2xl bg-gradient-to-br from-purple-800 to-indigo-600 shadow">
          <div className="text-sm opacity-70">Pending</div>
          <div className="text-2xl font-bold">0</div>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">Quick Verify</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="p-6 rounded-2xl bg-neutral-900 shadow">
            <InputField placeholder="Certificate ID" theme="neon" />
            <Button theme="neon" className="mt-3">Verify</Button>
          </div>
          <CertificateCard cert={demoCert} />
        </div>
      </div>
    </div>
  )
}