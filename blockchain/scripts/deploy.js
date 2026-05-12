const { ethers, network } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  const networkDetails = await ethers.provider.getNetwork();

  console.log("Deploying CertificateRegistry...");
  console.log("Network:", network.name);
  console.log("Chain ID:", networkDetails.chainId.toString());
  console.log("Deployer:", deployer.address);

  const CertificateRegistry = await ethers.getContractFactory(
    "CertificateRegistry",
  );
  const registry = await CertificateRegistry.deploy();
  await registry.waitForDeployment();

  const address = await registry.getAddress();

  console.log("CertificateRegistry deployed to:", address);
  console.log("Contract address:", address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
