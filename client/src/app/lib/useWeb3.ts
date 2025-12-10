// client/lib/useWeb3.ts
'use client'
import { useState, useEffect } from 'react'
import { ethers } from 'ethers'

export default function useWeb3() {
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null)
  const [signer, setSigner] = useState<ethers.JsonRpcSigner | null>(null)
  const [account, setAccount] = useState<string | null>(null)
  const [chainId, setChainId] = useState<number | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if ((window as any).ethereum) {
      const p = new ethers.BrowserProvider((window as any).ethereum)
      setProvider(p)
      p.getNetwork().then(n => setChainId(Number(n.chainId))).catch(()=>{})
      // listen account change
      ;(window as any).ethereum.on?.('accountsChanged', (accounts: string[]) => {
        setAccount(accounts[0] ?? null)
      })
      ;(window as any).ethereum.on?.('chainChanged', async () => {
        const n = await p.getNetwork(); setChainId(Number(n.chainId))
      })
    }
  }, [])

  async function connect() {
    if (!(window as any).ethereum) throw new Error('MetaMask not installed')
    await (window as any).ethereum.request({ method: 'eth_requestAccounts' })
    const p = new ethers.BrowserProvider((window as any).ethereum)
    setProvider(p)
    const s = await p.getSigner()
    setSigner(s)
    try {
      const addr = await s.getAddress()
      setAccount(addr)
    } catch (e) {
      setAccount(null)
    }
    const n = await p.getNetwork()
    setChainId(Number(n.chainId))
    return { provider: p, signer }
  }

  return { provider, signer, account, chainId, connect }
}