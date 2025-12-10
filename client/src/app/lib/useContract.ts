// client/lib/useContract.ts
import { useMemo } from 'react'
import { CERTIFICATE_ABI } from '../utils/abi'
import { CONTRACT_ADDRESS } from '../utils/config'
import { ethers } from 'ethers'

export default function useContract(signerOrProvider?: any) {
  return useMemo(() => {
    if (!signerOrProvider) return null
    try {
      return new ethers.Contract(CONTRACT_ADDRESS, CERTIFICATE_ABI, signerOrProvider)
    } catch (e) {
      console.error('contract init error', e)
      return null
    }
  }, [signerOrProvider])
}