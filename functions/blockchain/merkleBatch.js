const { ethers } = require("ethers");

function normalizeHash(hash) {
  const value = String(hash || "").trim().toLowerCase();

  if (!/^0x[0-9a-f]{64}$/.test(value)) {
    throw new Error("Merkle leaves must be bytes32 hex hashes");
  }

  return value;
}

function hashPair(left, right) {
  const [first, second] = left <= right ? [left, right] : [right, left];

  return ethers.keccak256(ethers.concat([first, second]));
}

function buildMerkleBatch(certificateHashes) {
  if (!Array.isArray(certificateHashes) || certificateHashes.length === 0) {
    throw new Error("At least one certificate hash is required");
  }

  const leaves = certificateHashes.map(normalizeHash);
  const levels = [leaves];

  while (levels[levels.length - 1].length > 1) {
    const currentLevel = levels[levels.length - 1];
    const nextLevel = [];

    for (let index = 0; index < currentLevel.length; index += 2) {
      const left = currentLevel[index];
      const right = currentLevel[index + 1] || left;

      nextLevel.push(hashPair(left, right));
    }

    levels.push(nextLevel);
  }

  const proofs = leaves.map((_, leafIndex) => {
    const proof = [];
    let currentIndex = leafIndex;

    for (let levelIndex = 0; levelIndex < levels.length - 1; levelIndex += 1) {
      const currentLevel = levels[levelIndex];
      const siblingIndex =
        currentIndex % 2 === 0 ? currentIndex + 1 : currentIndex - 1;
      const sibling = currentLevel[siblingIndex] || currentLevel[currentIndex];

      proof.push(sibling);
      currentIndex = Math.floor(currentIndex / 2);
    }

    return proof;
  });

  return {
    root: levels[levels.length - 1][0],
    leaves,
    proofs,
    size: leaves.length,
  };
}

module.exports = {
  buildMerkleBatch,
};
