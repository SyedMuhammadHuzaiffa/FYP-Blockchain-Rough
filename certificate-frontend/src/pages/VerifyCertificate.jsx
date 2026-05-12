import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import { computeCertificateHash } from "../blockchain/certificateHash";
import { verifyCertificateOnChain } from "../blockchain/verifyCertificateOnChain";
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

function getHashMatch({ certificate, computedHash, onChain }) {
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
  const [error, setError] = useState("");
  const [copiedField, setCopiedField] = useState("");
  const [pdfLoading, setPdfLoading] = useState(false);
  const [blockchainCheck, setBlockchainCheck] = useState({
    loading: false,
    checked: false,
    error: "",
    onChain: null,
    computedHash: "",
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
      setError("");
      setCertificate(null);
      setOrganizationName("");
      setBlockchainCheck({
        loading: false,
        checked: false,
        error: "",
        onChain: null,
        computedHash: "",
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

        if (certificateData.organizationId) {
          const organizationSnap = await getDoc(
            doc(db, "organizations", certificateData.organizationId),
          );

          setOrganizationName(
            organizationSnap.exists()
              ? organizationSnap.data()?.name || certificateData.organizationId
              : certificateData.organizationId,
          );
        }
      } catch (err) {
        console.error(err);
        setError("Unable to load certificate details.");
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

      setBlockchainCheck({
        loading: true,
        checked: false,
        error: "",
        onChain: null,
        computedHash,
      });

      try {
        const onChain = await verifyCertificateOnChain(
          certificate.certificateId || certificate.id,
        );

        if (!isActive) return;

        setBlockchainCheck({
          loading: false,
          checked: true,
          error: "",
          onChain,
          computedHash,
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
      setError("Could not copy this value.");
    }
  };

  const downloadCertificate = async ({
    blockchainResult,
    hashMatch,
    isRevoked,
  }) => {
    const currentCertificateId = certificate?.certificateId || certificate?.id;

    if (!currentCertificateId || !certificate?.studentName || !certificate?.courseName) {
      setError("This certificate does not have enough data to generate a PDF.");
      return;
    }

    setPdfLoading(true);
    setError("");

    try {
      await generateCertificatePdf(
        {
          ...certificate,
          certificateId: currentCertificateId,
          organizationName: organizationName || certificate?.organizationId,
        },
        {
          organizationName: organizationName || certificate?.organizationId,
          blockchainResult,
          computedHash: blockchainCheck.computedHash,
          onChain: blockchainCheck.onChain,
          hashMatch,
          isRevoked,
        },
      );
    } catch (err) {
      console.error(err);
      setError("Could not generate the certificate PDF. Please try again.");
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

  if (error && !certificate) {
    return renderPublicShell(
      <section className="card">
        <p className="eyebrow">Certificate Verification</p>
        <h1>Unable to verify certificate</h1>
        <div className="alert alert-error">{error}</div>
      </section>,
    );
  }

  const firestoreStatus = certificate?.status || "unknown";
  const blockchainResult = getBlockchainResult({ blockchainCheck, certificate });
  const isOnChainRevoked = Boolean(blockchainCheck.onChain?.revoked);
  const isRevoked = firestoreStatus === "revoked" || isOnChainRevoked;
  const hashMatch = blockchainCheck.onChain
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
  const heroState = getHeroState({
    firestoreStatus,
    blockchainResult,
    hashMatch,
    isRevoked,
  });
  const canDownloadCertificate =
    Boolean(certificate?.certificateId || certificate?.id) &&
    Boolean(certificate?.studentName) &&
    Boolean(certificate?.courseName) &&
    (heroState.title === "VALID CERTIFICATE" ||
      heroState.title === "REVOKED ON BLOCKCHAIN");

  const certificateRows = [
    ["Certificate ID", certificate?.certificateId || certificate?.id],
    ["Student Name", certificate?.studentName],
    ["Student Email", certificate?.studentEmail],
    ["Course Name", certificate?.courseName],
    ["Issue Date", certificate?.issueDate],
    ["Organization", organizationName || certificate?.organizationId],
    ["Issued By Email", certificate?.issuedByEmail],
  ];

  const proofRows = [
    ["Firestore Status", certificate?.status],
    ["Blockchain Status", certificate?.blockchainStatus],
    ["Blockchain Verification Result", blockchainResult],
    ["Hash Match", blockchainCheck.onChain ? (hashMatch ? "Yes" : "No") : "-"],
    [
      "On-chain Exists",
      blockchainCheck.onChain
        ? blockchainCheck.onChain.exists
          ? "Yes"
          : "No"
        : "-",
    ],
    [
      "On-chain Revoked",
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
    ["On-chain Issuer", blockchainCheck.onChain?.issuer],
    ["On-chain Issued At", blockchainCheck.onChain?.issuedAt],
    ["On-chain Revoked At", blockchainCheck.onChain?.revokedAt],
    ["On-chain IPFS CID", blockchainCheck.onChain?.ipfsCid],
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
              blockchainResult === BLOCKCHAIN_RESULT.VERIFIED
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

      {error ? <div className="alert alert-error">{error}</div> : null}

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
                blockchainResult === BLOCKCHAIN_RESULT.VERIFIED
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
          </div>

          <div className="proof-card-grid">
            <article className="proof-card">
              <span>Firestore</span>
              <strong>{formatValue(certificate?.status)}</strong>
            </article>
            <article className="proof-card">
              <span>Blockchain</span>
              <strong>{blockchainResult}</strong>
            </article>
            <article className="proof-card">
              <span>Hash Integrity</span>
              <strong>{hashBadgeText}</strong>
            </article>
          </div>

          <dl className="detail-list">
            <div className="detail-row">
              <dt>Blockchain Tx Hash</dt>
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
              <dt>On-chain Hash</dt>
              <dd className="hash-value">
                {formatValue(blockchainCheck.onChain?.certificateHash)}
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
