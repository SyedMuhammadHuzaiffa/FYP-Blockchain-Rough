// client/utils/abi.ts
export const CERTIFICATE_ABI = [
  "function createCertificate(address to, uint256 certId, string memory metadata) public",
  "function revokeCertificate(uint256 certId) public",
  "function isRevoked(uint256 certId) public view returns (bool)",
  "event CertificateCreated(address indexed issuer, address indexed to, uint256 certId)",
  "event CertificateRevoked(uint256 indexed certId)"
]