import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ethers } from "ethers";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import { computeCertificateHash } from "../blockchain/certificateHash";
import {
  verifyBatchOnChain,
  verifyCertificateOnChain,
} from "../blockchain/verifyCertificateOnChain";
import { ThemeToggle } from "../components/ThemeProvider";
import { generateCertificatePdf } from "../utils/certificatePdf";

const AMOY_TX_BASE_URL = "https://amoy.polygonscan.com/tx/";

const BLOCKCHAIN_RESULT = {
  CHECKING: "CHECKING BLOCKCHAIN",
  VERIFIED: "VERIFIED ON BLOCKCHAIN",
  REVOKED: "REVOKED ON BLOCKCHAIN",
  HASH_MISMATCH: "HASH MISMATCH",
  NOT_FOUND: "NOT FOUND ON BLOCKCHAIN",
  FAILED: "BLOCKCHAIN CHECK FAILED",
  BATCH_ANCHORED: "BATCH ROOT ANCHORED",
};

function formatValue(value) {
  if (value === undefined || value === null || value === "") {
    return "-";
  }

  if (typeof value?.toDate === "function") {
    return value.toDate().toLocaleDateString();
  }

  return String(value);
}

function getFallbackOrganizationName(certificate) {
  return (
    certificate?.organizationName ||
    certificate?.organizationId ||
    "Unknown Organization"
  );
}

function getTxLink(txHash) {
  return txHash ? `${AMOY_TX_BASE_URL}${txHash}` : "";
}

function normalizeHash(value) {
  return String(value || "").trim().toLowerCase();
}

function hashesEqual(left, right) {
  const normalizedLeft = normalizeHash(left);
  const normalizedRight = normalizeHash(right);

  return (
    Boolean(normalizedLeft && normalizedRight) &&
    normalizedLeft === normalizedRight
  );
}

function isBulkCertificate(certificate) {
  return certificate?.issuanceMode === "bulk";
}

function isBytes32Hex(value) {
  return /^0x[0-9a-f]{64}$/i.test(String(value || "").trim());
}

function hashPair(left, right) {
  const normalizedLeft = normalizeHash(left);
  const normalizedRight = normalizeHash(right);
  const [first, second] =
    normalizedLeft <= normalizedRight
      ? [normalizedLeft, normalizedRight]
      : [normalizedRight, normalizedLeft];

  return ethers.keccak256(ethers.concat([first, second]));
}

function verifyMerkleProof({ leafHash, proof, root }) {
  if (!isBytes32Hex(leafHash) || !isBytes32Hex(root) || !Array.isArray(proof)) {
    return false;
  }

  const computedRoot = proof.reduce((currentHash, siblingHash) => {
    if (!isBytes32Hex(siblingHash)) return "";

    return currentHash ? hashPair(currentHash, siblingHash) : "";
  }, normalizeHash(leafHash));

  return hashesEqual(computedRoot, root);
}

function getHashMatch({ certificate, computedHash, onChain }) {
  if (isBulkCertificate(certificate)) {
    return hashesEqual(certificate?.certificateHash, computedHash);
  }

  if (!onChain?.certificateHash) return false;

  return (
    hashesEqual(certificate?.certificateHash, computedHash) &&
    hashesEqual(onChain.certificateHash, computedHash)
  );
}

function getBlockchainResult({ blockchainCheck, certificate }) {
  if (!blockchainCheck.checked) return BLOCKCHAIN_RESULT.CHECKING;
  if (blockchainCheck.loading) return BLOCKCHAIN_RESULT.CHECKING;
  if (blockchainCheck.error) return BLOCKCHAIN_RESULT.FAILED;

  const { onChain, computedHash } = blockchainCheck;

  if (isBulkCertificate(certificate)) {
    if (!blockchainCheck.merkleProofValid) return BLOCKCHAIN_RESULT.HASH_MISMATCH;
    if (!onChain?.exists) return BLOCKCHAIN_RESULT.NOT_FOUND;
    if (onChain.revoked) return BLOCKCHAIN_RESULT.REVOKED;

    return hashesEqual(onChain.batchRoot, certificate?.batchRoot) &&
      getHashMatch({ certificate, computedHash, onChain })
      ? BLOCKCHAIN_RESULT.BATCH_ANCHORED
      : BLOCKCHAIN_RESULT.HASH_MISMATCH;
  }

  if (!onChain?.exists) return BLOCKCHAIN_RESULT.NOT_FOUND;
  if (onChain.revoked) return BLOCKCHAIN_RESULT.REVOKED;

  return getHashMatch({ certificate, computedHash, onChain })
    ? BLOCKCHAIN_RESULT.VERIFIED
    : BLOCKCHAIN_RESULT.HASH_MISMATCH;
}

function getBadgeClass(value, positiveValues = []) {
  const normalized = String(value || "").toLowerCase();

  if (positiveValues.includes(normalized)) return "badge badge-success";
  if (["revoked", "failed", "no", "mismatch"].includes(normalized)) {
    return "badge badge-error";
  }
  if (["pending", "checking", "unknown", "-"].includes(normalized)) {
    return "badge badge-warning";
  }

  return "badge";
}

function getMerkleProofBadgeValue(merkleProofValid) {
  if (merkleProofValid === null) return "checking";

  return merkleProofValid ? "confirmed" : "mismatch";
}

function getHeroState({ firestoreStatus, blockchainResult, hashMatch, isRevoked }) {
  if (isRevoked || blockchainResult === BLOCKCHAIN_RESULT.REVOKED) {
    return {
      title: "REVOKED ON BLOCKCHAIN",
      className: "status-hero status-risk",
    };
  }

  if (blockchainResult === BLOCKCHAIN_RESULT.HASH_MISMATCH || hashMatch === false) {
    return {
      title: "HASH MISMATCH",
      className: "status-hero status-risk",
    };
  }

  if (blockchainResult === BLOCKCHAIN_RESULT.NOT_FOUND) {
    return {
      title: "CERTIFICATE NOT FOUND",
      className: "status-hero status-risk",
    };
  }

  if (blockchainResult === BLOCKCHAIN_RESULT.VERIFIED && firestoreStatus === "issued") {
    return {
      title: "VALID CERTIFICATE",
      className: "status-hero status-valid",
    };
  }

  if (
    blockchainResult === BLOCKCHAIN_RESULT.BATCH_ANCHORED &&
    firestoreStatus === "issued"
  ) {
    return {
      title: "VALID CERTIFICATE",
      className: "status-hero status-valid",
    };
  }

  if (blockchainResult === BLOCKCHAIN_RESULT.CHECKING) {
    return {
      title: "CHECKING BLOCKCHAIN",
      className: "status-hero status-neutral",
    };
  }

  return {
    title: "CERTIFICATE STATUS UNKNOWN",
    className: "status-hero status-neutral",
  };
}

function truncateMiddle(value = "", visible = 12) {
  if (!value || value.length <= visible * 2 + 3) return value;
  return `${value.slice(0, visible)}...${value.slice(-visible)}`;
}

function CopyableValue({ label, value, href, copiedKey, copiedField, onCopy }) {
  if (!value) return formatValue(value);

  return (
    <span className="copy-row">
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" title={value}>
          {truncateMiddle(value)}
        </a>
      ) : (
        <span className="hash-value" title={value}>
          {truncateMiddle(value)}
        </span>
      )}
      <button
        type="button"
        className="button button-outline button-small"
        onClick={() => onCopy(copiedKey, value)}
      >
        {copiedField === copiedKey ? "Copied" : `Copy ${label}`}
      </button>
    </span>
  );
}

export default function VerifyCertificate() {
  const { certificateId } = useParams();
  const [certificate, setCertificate] = useState(null);
  const [organizationName, setOrganizationName] = useState("");
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [certificateError, setCertificateError] = useState("");
  const [organizationWarning, setOrganizationWarning] = useState("");
  const [pdfError, setPdfError] = useState("");
  const [copiedField, setCopiedField] = useState("");
  const [pdfLoading, setPdfLoading] = useState(false);
  const [blockchainCheck, setBlockchainCheck] = useState({
    loading: false,
    checked: false,
    error: "",
    onChain: null,
    computedHash: "",
    merkleProofValid: null,
  });

  useEffect(() => {
    async function fetchCertificate() {
      if (!certificateId) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setLoading(true);
      setNotFound(false);
      setCertificateError("");
      setOrganizationWarning("");
      setPdfError("");
      setCertificate(null);
      setOrganizationName("");
      setBlockchainCheck({
        loading: false,
        checked: false,
        error: "",
        onChain: null,
        computedHash: "",
        merkleProofValid: null,
      });

      try {
        const certificateSnap = await getDoc(
          doc(db, "certificates", certificateId),
        );

        if (!certificateSnap.exists()) {
          setNotFound(true);
          return;
        }

        const rawCertificateData = certificateSnap.data();
        const certificateData = {
          id: certificateSnap.id,
          ...rawCertificateData,
          certificateId: rawCertificateData?.certificateId || certificateSnap.id,
        };

        setCertificate(certificateData);
        setOrganizationName(getFallbackOrganizationName(certificateData));

        if (!certificateData.organizationName && certificateData.organizationId) {
          try {
            const organizationSnap = await getDoc(
              doc(db, "organizations", certificateData.organizationId),
            );

            if (organizationSnap.exists()) {
              setOrganizationName(
                organizationSnap.data()?.name ||
                  getFallbackOrganizationName(certificateData),
              );
            }
          } catch (organizationError) {
            console.warn("Organization lookup failed:", organizationError);
            setOrganizationWarning(
              "Organization name could not be loaded. Showing the saved organization reference instead.",
            );
          }
        }
      } catch (err) {
        console.error(err);
        setCertificate(null);
        setCertificateError("Unable to load certificate details.");
      } finally {
        setLoading(false);
      }
    }

    fetchCertificate();
  }, [certificateId]);

  useEffect(() => {
    let isActive = true;

    async function checkBlockchain() {
      if (!certificate) return;

      const computedHash = computeCertificateHash(certificate);
      const isBulk = isBulkCertificate(certificate);
      const merkleProofValid = isBulk
        ? verifyMerkleProof({
            leafHash: computedHash,
            proof: certificate.batchProof,
            root: certificate.batchRoot,
          })
        : null;

      setBlockchainCheck({
        loading: true,
        checked: false,
        error: "",
        onChain: null,
        computedHash,
        merkleProofValid,
      });

      try {
        const onChain = isBulk
          ? await verifyBatchOnChain(certificate.batchId)
          : await verifyCertificateOnChain(certificate.certificateId || certificate.id);

        if (!isActive) return;

        setBlockchainCheck({
          loading: false,
          checked: true,
          error: "",
          onChain,
          computedHash,
          merkleProofValid,
        });
      } catch (err) {
        console.error("Blockchain verification failed:", err);

        if (!isActive) return;

        setBlockchainCheck({
          loading: false,
          checked: true,
          error: err?.message || "Unable to check blockchain.",
          onChain: null,
          computedHash,
          merkleProofValid,
        });
      }
    }

    checkBlockchain();

    return () => {
      isActive = false;
    };
  }, [certificate]);

  const copyValue = async (key, value) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(key);
      window.setTimeout(() => setCopiedField(""), 2000);
    } catch (err) {
      console.error(err);
      setPdfError("Could not copy this value.");
    }
  };

  const downloadCertificate = async ({
    blockchainResult,
    hashMatch,
    isRevoked,
  }) => {
    const currentCertificateId = certificate?.certificateId || certificate?.id;

    if (!currentCertificateId) {
      setPdfError("This certificate is missing an ID, so the PDF cannot be generated.");
      return;
    }

    setPdfLoading(true);
    setPdfError("");

    try {
      const resolvedOrganizationName =
        organizationName || getFallbackOrganizationName(certificate);

      await generateCertificatePdf(
        {
          ...certificate,
          certificateId: currentCertificateId,
          organizationName: resolvedOrganizationName,
        },
        {
          organizationName: resolvedOrganizationName,
          blockchainResult,
          computedHash: blockchainCheck.computedHash,
          onChain: blockchainCheck.onChain,
          hashMatch,
          isRevoked,
        },
      );
    } catch (err) {
      console.error(err);
      setPdfError("Could not generate the certificate PDF. Please try again.");
    } finally {
      setPdfLoading(false);
    }
  };

  const renderPublicShell = (children) => (
    <main className="public-shell">
      <div className="public-topbar">
        <Link to="/login" className="brand-lockup">
          <span className="brand-mark">BC</span>
          <span>
            <span className="brand-title">CertChain</span>
            <span className="brand-subtitle">Public Verification</span>
          </span>
        </Link>
        <ThemeToggle />
      </div>
      <div className="verify-wrap">{children}</div>
    </main>
  );

  if (loading) {
    return renderPublicShell(<div className="loading-screen">Loading certificate...</div>);
  }

  if (notFound) {
    return renderPublicShell(
      <section className="status-hero status-risk">
        <span className="badge badge-error">Firestore lookup</span>
        <h1>CERTIFICATE NOT FOUND</h1>
        <p className="muted">No certificate exists for ID: {certificateId || "-"}</p>
      </section>,
    );
  }

  if (certificateError && !certificate) {
    return renderPublicShell(
      <section className="card">
        <p className="eyebrow">Certificate Verification</p>
        <h1>Unable to verify certificate</h1>
        <div className="alert alert-error">{certificateError}</div>
      </section>,
    );
  }

  const firestoreStatus = certificate?.status || "unknown";
  const isBulk = isBulkCertificate(certificate);
  const blockchainResult = getBlockchainResult({ blockchainCheck, certificate });
  const isOnChainRevoked = Boolean(blockchainCheck.onChain?.revoked);
  const isRevoked = firestoreStatus === "revoked" || isOnChainRevoked;
  const hashMatch =
    isBulk || blockchainCheck.onChain
      ? getHashMatch({
          certificate,
          computedHash: blockchainCheck.computedHash,
          onChain: blockchainCheck.onChain,
        })
      : null;
  const hashBadgeValue =
    hashMatch === null ? "checking" : hashMatch ? "yes" : "mismatch";
  const hashBadgeText =
    hashMatch === null ? "Hash Checking" : hashMatch ? "Hash Match" : "Hash Mismatch";
  const merkleProofText =
    blockchainCheck.merkleProofValid === null
      ? "Proof Checking"
      : blockchainCheck.merkleProofValid
        ? "MERKLE PROOF VALID"
        : "Merkle Proof Invalid";
  const heroState = getHeroState({
    firestoreStatus,
    blockchainResult,
    hashMatch,
    isRevoked,
  });
  const canDownloadCertificate =
    Boolean(certificate?.certificateId || certificate?.id) &&
    (heroState.title === "VALID CERTIFICATE" ||
      heroState.title === "REVOKED ON BLOCKCHAIN");

  const certificateRows = [
    ["Certificate ID", certificate?.certificateId || certificate?.id],
    ["Student Name", certificate?.studentName],
    ["Student Email", certificate?.studentEmail],
    ["Course Name", certificate?.courseName],
    ["Issue Date", certificate?.issueDate],
    ["Organization", organizationName || getFallbackOrganizationName(certificate)],
    ["Issued By Email", certificate?.issuedByEmail],
  ];

  const proofRows = [
    ["Issuance Mode", certificate?.issuanceMode || "single"],
    ["Firestore Status", certificate?.status],
    ["Blockchain Status", certificate?.blockchainStatus],
    ["Blockchain Verification Result", blockchainResult],
    ["Hash Match", hashMatch === null ? "-" : hashMatch ? "Yes" : "No"],
    ["Merkle Proof", isBulk ? merkleProofText : "-"],
    ["Batch ID", isBulk ? certificate?.batchId : "-"],
    ["Batch Root", isBulk ? certificate?.batchRoot : "-"],
    ["Batch Index", isBulk ? certificate?.batchIndex : "-"],
    ["Batch Size", isBulk ? certificate?.batchSize : "-"],
    ["Batch Tx Hash", isBulk ? certificate?.blockchainTxHash : "-"],
    [
      isBulk ? "On-chain Batch Exists" : "On-chain Exists",
      blockchainCheck.onChain
        ? blockchainCheck.onChain.exists
          ? "Yes"
          : "No"
        : "-",
    ],
    [
      isBulk ? "On-chain Batch Revoked" : "On-chain Revoked",
      blockchainCheck.onChain
        ? blockchainCheck.onChain.revoked
          ? "Yes"
          : "No"
        : "-",
    ],
    ["Blockchain Revocation Status", certificate?.blockchainRevocationStatus],
    ["Revoke Block Number", certificate?.revokeBlockNumber],
    ["Blockchain Revoked At", certificate?.blockchainRevokedAt],
    [
      "Blockchain Revoked By Address",
      certificate?.blockchainRevokedByAddress,
    ],
    ["Block Number", certificate?.blockNumber],
    [
      isBulk ? "On-chain Batch Root" : "On-chain Hash",
      isBulk
        ? blockchainCheck.onChain?.batchRoot
        : blockchainCheck.onChain?.certificateHash,
    ],
    ["On-chain Issuer", blockchainCheck.onChain?.issuer],
    ["On-chain Issued At", blockchainCheck.onChain?.issuedAt],
    ["On-chain Revoked At", blockchainCheck.onChain?.revokedAt],
    ["On-chain IPFS CID", isBulk ? "-" : blockchainCheck.onChain?.ipfsCid],
    ["IPFS Status", certificate?.ipfsStatus],
    ["Blockchain Check Error", blockchainCheck.error],
  ];

  return renderPublicShell(
    <div className="grid">
      <section className={heroState.className}>
        <div className="badge-row">
          <span className={getBadgeClass(firestoreStatus, ["issued"])}>
            Firestore {firestoreStatus}
          </span>
          <span
            className={getBadgeClass(
              blockchainResult === BLOCKCHAIN_RESULT.VERIFIED ||
                blockchainResult === BLOCKCHAIN_RESULT.BATCH_ANCHORED
                ? "confirmed"
                : blockchainResult,
              ["confirmed"],
            )}
          >
            {blockchainResult}
          </span>
          <span className={getBadgeClass(hashBadgeValue, ["yes"])}>
            {hashBadgeText}
          </span>
          {isBulk ? (
            <span
              className={getBadgeClass(
                getMerkleProofBadgeValue(blockchainCheck.merkleProofValid),
                ["confirmed"],
              )}
            >
              {merkleProofText}
            </span>
          ) : null}
          <span className={getBadgeClass(isRevoked ? "revoked" : "active", ["active"])}>
            {isRevoked ? "Revoked" : "Not Revoked"}
          </span>
        </div>

        <h1>{heroState.title}</h1>
        <p className="muted">
          Certificate ID: {certificate?.certificateId || certificate?.id}
        </p>
        {canDownloadCertificate ? (
          <div className="button-row" style={{ marginTop: 18 }}>
            <button
              type="button"
              onClick={() =>
                downloadCertificate({
                  blockchainResult,
                  hashMatch,
                  isRevoked,
                })
              }
              disabled={pdfLoading}
              className="button button-tonal"
            >
              {pdfLoading ? "Generating PDF..." : "Download Certificate PDF"}
            </button>
          </div>
        ) : null}
      </section>

      {organizationWarning ? <div className="alert">{organizationWarning}</div> : null}
      {pdfError ? <div className="alert alert-error">{pdfError}</div> : null}

      <div className="grid grid-two">
        <section className="card">
          <h2>Certificate Info</h2>
          <dl className="detail-list">
            {certificateRows.map(([label, value]) => (
              <div className="detail-row" key={label}>
                <dt>{label}</dt>
                <dd>{formatValue(value)}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="card">
          <h2>Trust Proof</h2>
          <div className="badge-row" style={{ marginBottom: 14 }}>
            <span className={getBadgeClass(firestoreStatus, ["issued"])}>
              Firestore
            </span>
            <span
              className={getBadgeClass(
                blockchainResult === BLOCKCHAIN_RESULT.VERIFIED ||
                  blockchainResult === BLOCKCHAIN_RESULT.BATCH_ANCHORED
                  ? "confirmed"
                  : blockchainResult,
                ["confirmed"],
              )}
            >
              Blockchain
            </span>
            <span className={getBadgeClass(hashBadgeValue, ["yes"])}>
              Hash
            </span>
            {isBulk ? (
              <span
                className={getBadgeClass(
                  getMerkleProofBadgeValue(blockchainCheck.merkleProofValid),
                  ["confirmed"],
                )}
              >
                Merkle
              </span>
            ) : null}
          </div>

          <div className="proof-card-grid">
            <article className="proof-card">
              <span>Firestore</span>
              <strong>{formatValue(certificate?.status)}</strong>
            </article>
            <article className="proof-card">
              <span>{isBulk ? "Batch Root" : "Blockchain"}</span>
              <strong>{blockchainResult}</strong>
            </article>
            <article className="proof-card">
              <span>Hash Integrity</span>
              <strong>{hashBadgeText}</strong>
            </article>
            {isBulk ? (
              <article className="proof-card">
                <span>Merkle Proof</span>
                <strong>{merkleProofText}</strong>
              </article>
            ) : null}
          </div>

          <dl className="detail-list">
            <div className="detail-row">
              <dt>{isBulk ? "Batch Tx Hash" : "Blockchain Tx Hash"}</dt>
              <dd>
                <CopyableValue
                  label="Tx"
                  value={certificate?.blockchainTxHash}
                  href={getTxLink(certificate?.blockchainTxHash)}
                  copiedKey="tx"
                  copiedField={copiedField}
                  onCopy={copyValue}
                />
              </dd>
            </div>

            {isBulk ? (
              <>
                <div className="detail-row">
                  <dt>Batch ID</dt>
                  <dd className="hash-value">{formatValue(certificate?.batchId)}</dd>
                </div>
                <div className="detail-row">
                  <dt>Batch Root</dt>
                  <dd className="hash-value">{formatValue(certificate?.batchRoot)}</dd>
                </div>
                <div className="detail-row">
                  <dt>Batch Index</dt>
                  <dd>{formatValue(certificate?.batchIndex)}</dd>
                </div>
                <div className="detail-row">
                  <dt>Batch Size</dt>
                  <dd>{formatValue(certificate?.batchSize)}</dd>
                </div>
              </>
            ) : null}

            <div className="detail-row">
              <dt>Revoke Tx Hash</dt>
              <dd>
                <CopyableValue
                  label="Revoke Tx"
                  value={certificate?.revokeTxHash}
                  href={getTxLink(certificate?.revokeTxHash)}
                  copiedKey="revokeTx"
                  copiedField={copiedField}
                  onCopy={copyValue}
                />
              </dd>
            </div>

            <div className="detail-row">
              <dt>Contract Address</dt>
              <dd>
                <CopyableValue
                  label="Contract"
                  value={certificate?.contractAddress}
                  copiedKey="contract"
                  copiedField={copiedField}
                  onCopy={copyValue}
                />
              </dd>
            </div>

            <div className="detail-row">
              <dt>Firestore Hash</dt>
              <dd className="hash-value">{formatValue(certificate?.certificateHash)}</dd>
            </div>

            <div className="detail-row">
              <dt>Computed Hash</dt>
              <dd className="hash-value">
                {formatValue(blockchainCheck.computedHash)}
              </dd>
            </div>

            <div className="detail-row">
              <dt>{isBulk ? "On-chain Batch Root" : "On-chain Hash"}</dt>
              <dd className="hash-value">
                {formatValue(
                  isBulk
                    ? blockchainCheck.onChain?.batchRoot
                    : blockchainCheck.onChain?.certificateHash,
                )}
              </dd>
            </div>
          </dl>
        </section>
      </div>

      <section className="card">
        <div className="section-header">
          <div>
            <h2>Verification Details</h2>
            <p className="muted">
              Full Firestore and Polygon Amoy verification fields.
            </p>
          </div>
        </div>

        <div className="table-container">
          <table className="table">
            <tbody>
              {proofRows.map(([label, value]) => (
                <tr key={label}>
                  <th>{label}</th>
                  <td className="hash-value">{formatValue(value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>,
  );
}
