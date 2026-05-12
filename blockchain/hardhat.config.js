require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");
require("dotenv").config();

const {
  BLOCKCHAIN_RPC_URL,
  BLOCKCHAIN_PRIVATE_KEY,
  BLOCKCHAIN_CHAIN_ID,
} = process.env;

const amoy = {
  url: BLOCKCHAIN_RPC_URL || "https://polygon-amoy.drpc.org",
  chainId: Number(BLOCKCHAIN_CHAIN_ID || 80002),
};

if (BLOCKCHAIN_PRIVATE_KEY) {
  amoy.accounts = [BLOCKCHAIN_PRIVATE_KEY];
}

const networks = {
  hardhat: {
    chainId: 31337,
  },
  localhost: {
    url: "http://127.0.0.1:8545",
    chainId: 31337,
  },
  amoy,
};

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks,
};
