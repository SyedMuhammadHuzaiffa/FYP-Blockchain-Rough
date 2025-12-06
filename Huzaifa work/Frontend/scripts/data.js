// Mock dataset (used when CONFIG.API_BASE is empty).
// Replace or extend these with your own sample certificates.
// Shape reference:
// {
//   id: string,
//   studentId: string,
//   holder: string,
//   program: string,
//   issuedAt: ISODateString,
//   hash: string,
//   status: 'valid' | 'revoked' | 'unknown',
//   revokeReason?: string,
//   txUrl?: string,
//   txHash?: string
// }

window.CERTS = [
  {
    id: 'CERT-001',
    studentId: 'stu-ali',
    holder: 'Ali Raza',
    program: 'BS Computer Science',
    issuedAt: '2024-06-01',
    hash: '0xabc123',
    status: 'valid',
    txUrl: '' // or provide txHash: '0x...' and set CONFIG.CHAIN_EXPLORER_BASE
  },
  {
    id: 'CERT-002',
    studentId: 'stu-fatima',
    holder: 'Fatima Khan',
    program: 'BSEE',
    issuedAt: '2024-06-02',
    hash: '0xdef456',
    status: 'revoked',
    revokeReason: 'Duplicate record',
    txUrl: ''
  },
  {
    id: 'CERT-003',
    studentId: 'stu-ali',
    holder: 'Ali Raza',
    program: 'Blockchain Fundamentals',
    issuedAt: '2024-09-15',
    hash: '0x987654',
    status: 'valid',
    txUrl: ''
  }
];