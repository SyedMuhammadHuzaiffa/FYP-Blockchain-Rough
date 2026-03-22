// src/libs/merkleUtils.js
// Off-chain Merkle tree builder — matches MerkleCertificate.sol exactly
// npm install ethers (already installed)

import { ethers } from "ethers";

/**
 * Build a leaf hash for one certificate.
 * MUST match the Solidity: keccak256(abi.encodePacked(keccak256(abi.encodePacked(cid, name, competition))))
 */
export function buildLeaf(cid, name, competition) {
  // Inner hash — same as abi.encodePacked(cid, name, competition)
  const inner = ethers.keccak256(
    ethers.toUtf8Bytes(cid + name + competition)
  );
  // Outer hash (double-hash for OpenZeppelin MerkleProof compatibility)
  return ethers.keccak256(inner);
}

/**
 * Build a complete Merkle tree from an array of certificates.
 * Returns: { root, tree, leaves }
 *
 * certificates = [{ cid, name, competition }, ...]
 */
export function buildMerkleTree(certificates) {
  if (!certificates || certificates.length === 0) {
    throw new Error("No certificates provided");
  }

  // Build leaves
  const leaves = certificates.map((cert) =>
    buildLeaf(cert.cid, cert.name, cert.competition)
  );

  // Sort leaves for deterministic tree (matches Solidity sorted pair hashing)
  const sortedLeaves = [...leaves].sort();

  // Build tree bottom-up
  const tree = [sortedLeaves];

  let currentLevel = sortedLeaves;
  while (currentLevel.length > 1) {
    const nextLevel = [];
    for (let i = 0; i < currentLevel.length; i += 2) {
      const left  = currentLevel[i];
      const right = currentLevel[i + 1] || left; // duplicate last if odd
      // Sort pair — matches Solidity _verifyProof
      const combined =
        left <= right
          ? ethers.keccak256(ethers.concat([left, right]))
          : ethers.keccak256(ethers.concat([right, left]));
      nextLevel.push(combined);
    }
    tree.push(nextLevel);
    currentLevel = nextLevel;
  }

  const root = currentLevel[0];
  return { root, tree, leaves: sortedLeaves, originalLeaves: leaves };
}

/**
 * Get proof for a specific certificate in the tree.
 * Returns: bytes32[] proof array (pass directly to contract)
 *
 * certificates = same array used to build the tree
 * index = index of the certificate you want the proof for
 */
export function getMerkleProof(certificates, index) {
  const { tree, originalLeaves, leaves } = buildMerkleTree(certificates);

  // Find where this leaf ended up after sorting
  const targetLeaf = originalLeaves[index];
  let currentIndex = leaves.indexOf(targetLeaf);

  if (currentIndex === -1) {
    throw new Error("Certificate not found in tree");
  }

  const proof = [];
  for (let level = 0; level < tree.length - 1; level++) {
    const currentLevel = tree[level];
    const siblingIndex =
      currentIndex % 2 === 0 ? currentIndex + 1 : currentIndex - 1;

    if (siblingIndex < currentLevel.length) {
      proof.push(currentLevel[siblingIndex]);
    }
    // Move up to parent
    currentIndex = Math.floor(currentIndex / 2);
  }

  return proof;
}

/**
 * Get proof for a certificate by its CID (easier API)
 */
export function getMerkleProofByCid(certificates, cid) {
  const index = certificates.findIndex((c) => c.cid === cid);
  if (index === -1) throw new Error("CID not found in certificates");
  return getMerkleProof(certificates, index);
}

/**
 * Verify a proof locally (before sending to blockchain)
 */
export function verifyLocally(root, cid, name, competition, proof) {
  let computed = buildLeaf(cid, name, competition);
  for (const sibling of proof) {
    if (computed <= sibling) {
      computed = ethers.keccak256(ethers.concat([computed, sibling]));
    } else {
      computed = ethers.keccak256(ethers.concat([sibling, computed]));
    }
  }
  return computed === root;
}