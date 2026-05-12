# Certificate Registry Blockchain Module

This module contains the Hardhat smart contract project for the FYP Blockchain Certificate Verification System.

The contract stores only certificate proof metadata on-chain. Student personal data remains off-chain in Firestore.

## Contract

`contracts/CertificateRegistry.sol`

Stores certificate records by Firestore `certificateId`:

- `bytes32 certificateHash`
- `string ipfsCid`
- `address issuer`
- `uint256 issuedAt`
- `bool revoked`
- `uint256 revokedAt`

The owner is set during deployment and is an authorized issuer by default.

## Commands

Install dependencies:

```bash
npm install
```

Compile:

```bash
npm run compile
```

Run tests:

```bash
npm test
```

Deploy to Polygon Amoy:

```bash
npx hardhat run scripts/deploy.js --network amoy
```

## Environment

Copy `.env.example` to `.env` and set:

- `BLOCKCHAIN_RPC_URL`
- `BLOCKCHAIN_PRIVATE_KEY`
- `BLOCKCHAIN_CHAIN_ID`
- `CERTIFICATE_REGISTRY_ADDRESS` after deployment

Do not commit `.env` or private keys.

## Polygon Amoy Deployment

Amoy is the Polygon PoS testnet. Use it for FYP test deployments before any mainnet work.

Network details:

- Network name: Polygon Amoy
- Hardhat network name: `amoy`
- Chain ID: `80002`
- Gas token: POL / test MATIC depending on wallet and faucet wording
- Block explorer: `https://amoy.polygonscan.com/`

Create the local environment file:

```bash
cp .env.example .env
```

Edit `.env`:

```bash
BLOCKCHAIN_RPC_URL=https://polygon-amoy.drpc.org
BLOCKCHAIN_PRIVATE_KEY=0xyour_private_key_without_quotes
BLOCKCHAIN_CHAIN_ID=80002
CERTIFICATE_REGISTRY_ADDRESS=
```

Compile and test before deployment:

```bash
npx hardhat compile
npx hardhat test
```

Deploy:

```bash
npx hardhat run scripts/deploy.js --network amoy
```

After deployment, copy the printed `Contract address` into `CERTIFICATE_REGISTRY_ADDRESS` for later Firebase Functions integration.

## Firebase Integration Plan

Firebase Functions should later compute the canonical certificate hash, call `issueCertificate`, wait for confirmation, and update `certificates/{certificateId}` with blockchain transaction metadata.
