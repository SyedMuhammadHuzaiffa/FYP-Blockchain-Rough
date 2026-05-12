const { expect } = require("chai");
const { ethers } = require("hardhat");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

describe("CertificateRegistry", function () {
  const certificateId = "cert-firestore-001";
  const ipfsCid = "bafybeicertificatecidexample";

  let owner;
  let issuer;
  let unauthorized;
  let registry;
  let certificateHash;

  beforeEach(async function () {
    [owner, issuer, unauthorized] = await ethers.getSigners();
    certificateHash = ethers.keccak256(ethers.toUtf8Bytes("certificate-v1"));

    const CertificateRegistry = await ethers.getContractFactory(
      "CertificateRegistry",
    );
    registry = await CertificateRegistry.deploy();
    await registry.waitForDeployment();
  });

  async function issueDefaultCertificate(signer = owner) {
    const tx = await registry
      .connect(signer)
      .issueCertificate(certificateId, certificateHash, ipfsCid);
    const receipt = await tx.wait();

    return { tx, receipt };
  }

  it("owner is authorized by default", async function () {
    expect(await registry.owner()).to.equal(owner.address);
    expect(await registry.authorizedIssuers(owner.address)).to.equal(true);
  });

  it("owner can authorize issuer", async function () {
    await expect(registry.authorizeIssuer(issuer.address))
      .to.emit(registry, "IssuerAuthorized")
      .withArgs(issuer.address);

    expect(await registry.authorizedIssuers(issuer.address)).to.equal(true);
  });

  it("owner can remove issuer", async function () {
    await registry.authorizeIssuer(issuer.address);

    await expect(registry.removeIssuer(issuer.address))
      .to.emit(registry, "IssuerRemoved")
      .withArgs(issuer.address);

    expect(await registry.authorizedIssuers(issuer.address)).to.equal(false);
  });

  it("unauthorized user cannot issue", async function () {
    await expect(
      registry
        .connect(unauthorized)
        .issueCertificate(certificateId, certificateHash, ipfsCid),
    ).to.be.revertedWith("Not authorized issuer");
  });

  it("authorized issuer can issue", async function () {
    await registry.authorizeIssuer(issuer.address);

    await expect(
      registry
        .connect(issuer)
        .issueCertificate(certificateId, certificateHash, ipfsCid),
    )
      .to.emit(registry, "CertificateIssued")
      .withArgs(
        certificateId,
        certificateHash,
        ipfsCid,
        issuer.address,
        anyValue,
      );
  });

  it("duplicate issue fails", async function () {
    await issueDefaultCertificate();

    await expect(
      registry.issueCertificate(certificateId, certificateHash, ipfsCid),
    ).to.be.revertedWith("Already issued");
  });

  it("verify existing certificate returns correct fields", async function () {
    const { receipt } = await issueDefaultCertificate();
    const block = await ethers.provider.getBlock(receipt.blockNumber);

    const result = await registry.verifyCertificate(certificateId);

    expect(result.certificateHash).to.equal(certificateHash);
    expect(result.ipfsCid).to.equal(ipfsCid);
    expect(result.issuer).to.equal(owner.address);
    expect(result.issuedAt).to.equal(block.timestamp);
    expect(result.revoked).to.equal(false);
    expect(result.revokedAt).to.equal(0n);
    expect(result.exists).to.equal(true);
  });

  it("verify missing certificate returns exists false", async function () {
    const result = await registry.verifyCertificate("missing-cert");

    expect(result.certificateHash).to.equal(ethers.ZeroHash);
    expect(result.ipfsCid).to.equal("");
    expect(result.issuer).to.equal(ethers.ZeroAddress);
    expect(result.issuedAt).to.equal(0n);
    expect(result.revoked).to.equal(false);
    expect(result.revokedAt).to.equal(0n);
    expect(result.exists).to.equal(false);
  });

  it("authorized issuer can revoke", async function () {
    await registry.authorizeIssuer(issuer.address);
    await issueDefaultCertificate(issuer);

    await expect(registry.connect(issuer).revokeCertificate(certificateId))
      .to.emit(registry, "CertificateRevoked")
      .withArgs(certificateId, issuer.address, anyValue);

    const result = await registry.verifyCertificate(certificateId);

    expect(result.revoked).to.equal(true);
    expect(result.revokedAt).to.be.greaterThan(0n);
  });

  it("duplicate revoke fails", async function () {
    await issueDefaultCertificate();
    await registry.revokeCertificate(certificateId);

    await expect(registry.revokeCertificate(certificateId)).to.be.revertedWith(
      "Already revoked",
    );
  });

  it("unauthorized user cannot revoke", async function () {
    await issueDefaultCertificate();

    await expect(
      registry.connect(unauthorized).revokeCertificate(certificateId),
    ).to.be.revertedWith("Not authorized issuer");
  });

  it("empty certificateId revoke fails", async function () {
    await expect(registry.revokeCertificate("")).to.be.revertedWith(
      "Empty certificateId",
    );
  });

  it("empty certificateId fails", async function () {
    await expect(
      registry.issueCertificate("", certificateHash, ipfsCid),
    ).to.be.revertedWith("Empty certificateId");
  });

  it("zero certificateHash fails", async function () {
    await expect(
      registry.issueCertificate(certificateId, ethers.ZeroHash, ipfsCid),
    ).to.be.revertedWith("Empty certificateHash");
  });
});
