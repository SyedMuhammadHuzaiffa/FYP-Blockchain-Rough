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
import { shareCertificate } from "../utils/shareCertificate";
import { useToast } from "../components/toastContext";

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
  if (
    ["revoked", "failed", "no", "mismatch"].includes(normalized) ||
    normalized.includes("failed") ||
    normalized.includes("mismatch")
  ) {
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

function getIpfsBadge(certificate) {
  const status = String(certificate?.ipfsStatus || "").toLowerCase();
  const hasIpfsProof = Boolean(certificate?.ipfsCid || certificate?.ipfsGatewayUrl);

  if (status === "uploaded" || hasIpfsProof) {
    return { value: "uploaded", text: "IPFS Uploaded" };
  }

  if (status === "failed" || status === "error") {
    return { value: "failed", text: "IPFS Not Uploaded" };
  }

  return null;
}

function getHeroState({ firestoreStatus, blockchainResult, hashMatch, isRevoked }) {
  if (isRevoked || blockchainResult === BLOCKCHAIN_RESULT.REVOKED) {
    return {
      title: "REVOKED CERTIFICATE",
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

  if (blockchainResult === BLOCKCHAIN_RESULT.FAILED && firestoreStatus === "issued") {
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

export default function VerifyCertificate() {
  const { certificateId } = useParams();
  const [certificate, setCertificate] = useState(null);
  const [organizationName, setOrganizationName] = useState("");
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [certificateError, setCertificateError] = useState("");
  const [organizationWarning, setOrganizationWarning] = useState("");
  const [pdfLoading, setPdfLoading] = useState(false);
  const toast = useToast();
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

  const downloadCertificate = async ({
    blockchainResult,
    hashMatch,
    isRevoked,
  }) => {
    const currentCertificateId = certificate?.certificateId || certificate?.id;

    if (!currentCertificateId) {
      toast.error("This certificate is missing an ID, so the PDF cannot be generated.");
      return;
    }

    setPdfLoading(true);

    try {
      const { generateCertificatePdf } = await import("../utils/certificatePdf");
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
      toast.success("Certificate PDF downloaded.");
    } catch (err) {
      console.error(err);
      toast.error("Could not generate the certificate PDF. Please try again.");
    } finally {
      setPdfLoading(false);
    }
  };

  const handleShareCertificate = async ({
    blockchainResult,
    hashMatch,
    isRevoked,
  }) => {
    const currentCertificateId = certificate?.certificateId || certificate?.id;

    if (!currentCertificateId) {
      toast.error("This certificate is missing an ID, so it cannot be shared.");
      return;
    }

    try {
      const result = await shareCertificate({
        ...certificate,
        certificateId: currentCertificateId,
        organizationName: organizationName || getFallbackOrganizationName(certificate),
        blockchainShareStatus: [
          blockchainResult,
          hashMatch === false ? "hash mismatch" : "",
          isRevoked ? "revoked" : "",
        ]
          .filter(Boolean)
          .join(", "),
      });

      if (result === "shared") {
        toast.success("Certificate shared.");
        return;
      }

      toast.info("Sharing is not available here, so the certificate details were copied.");
    } catch (err) {
      console.error(err);
      toast.error("Could not share this certificate. Please try again.");
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
  const blockchainUnavailable = blockchainResult === BLOCKCHAIN_RESULT.FAILED;
  const isOnChainRevoked = Boolean(blockchainCheck.onChain?.revoked);
  const isRevoked = firestoreStatus === "revoked" || isOnChainRevoked;
  const hashMatch =
    blockchainCheck.checked && (isBulk || blockchainCheck.onChain)
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
      heroState.title === "REVOKED CERTIFICATE");
  const ipfsBadge = getIpfsBadge(certificate);

  const certificateRows = [
    ["Certificate ID", certificate?.certificateId || certificate?.id],
    ["Certificate Title", certificate?.certificateTitle],
    ["Student Name", certificate?.studentName],
    ["Student Email", certificate?.studentEmail],
    ["Course Name", certificate?.courseName],
    ["Description", certificate?.description],
    ["Grade / Result", certificate?.gradeOrResult],
    ["Duration", certificate?.duration],
    ["Venue", certificate?.venue],
    ["Instructor", certificate?.instructorName],
    ["Remarks", certificate?.remarks],
    ["Issue Date", certificate?.issueDate],
    ["Organization", organizationName || getFallbackOrganizationName(certificate)],
    ["Issued By Email", certificate?.issuedByEmail],
  ].filter(([, value]) => value !== undefined && value !== null && value !== "");

  const statusCards = [
    {
      label: "Firestore",
      value: `Firestore ${formatValue(certificate?.status)}`,
      badgeValue: certificate?.status,
      positiveValues: ["issued"],
    },
    ...(blockchainUnavailable
      ? []
      : [
          {
            label: isBulk ? "Batch Anchor" : "Blockchain",
            value: blockchainResult,
            badgeValue:
              blockchainResult === BLOCKCHAIN_RESULT.VERIFIED ||
              blockchainResult === BLOCKCHAIN_RESULT.BATCH_ANCHORED
                ? "confirmed"
                : blockchainResult,
            positiveValues: ["confirmed"],
          },
        ]),
    {
      label: "Hash Integrity",
      value: hashBadgeText,
      badgeValue: hashBadgeValue,
      positiveValues: ["yes"],
    },
    ...(isBulk
      ? [
          {
            label: "Merkle Proof",
            value: merkleProofText,
            badgeValue: getMerkleProofBadgeValue(blockchainCheck.merkleProofValid),
            positiveValues: ["confirmed"],
          },
        ]
      : []),
    ...(ipfsBadge
      ? [
          {
            label: "IPFS",
            value: ipfsBadge.text,
            badgeValue: ipfsBadge.value,
            positiveValues: ["uploaded"],
          },
        ]
      : []),
    {
      label: "Revocation",
      value: isRevoked ? "Revoked" : "Not Revoked",
      badgeValue: isRevoked ? "revoked" : "active",
      positiveValues: ["active"],
    },
  ];

  const renderStatusBadges = () => (
    <div className="badge-row">
      {statusCards.map(({ label, value, badgeValue, positiveValues }) => (
        <span
          key={label}
          className={getBadgeClass(badgeValue, positiveValues)}
        >
          {value}
        </span>
      ))}
    </div>
  );

  return renderPublicShell(
    <div className="grid">
      <section className={heroState.className}>
        {renderStatusBadges()}

        <h1>{heroState.title}</h1>
        <p className="muted">
          Certificate ID: {certificate?.certificateId || certificate?.id}
        </p>
        {certificate?.certificateId || certificate?.id ? (
          <div className="button-row" style={{ marginTop: 18 }}>
            {canDownloadCertificate ? (
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
            ) : null}
            <button
              type="button"
              onClick={() =>
                handleShareCertificate({
                  blockchainResult,
                  hashMatch,
                  isRevoked,
                })
              }
              className="button button-outline"
            >
              Share Certificate
            </button>
          </div>
        ) : null}
      </section>

      {organizationWarning ? <div className="alert">{organizationWarning}</div> : null}
      {blockchainUnavailable ? (
        <div className="alert">
          Blockchain check is temporarily unavailable. Certificate record is still
          shown from Firestore.
        </div>
      ) : null}
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
          <h2>Status Checks</h2>
          {renderStatusBadges()}

          <div className="proof-card-grid">
            {statusCards.map(({ label, value }) => (
              <article className="proof-card" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>,
  );
}
