import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { QRCodeCanvas } from "qrcode.react";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";

import Navbar from "../components/Navbar";
import { db } from "../firebase";
import { generateCertificatePdf } from "../utils/certificatePdf";
import { shareCertificate } from "../utils/shareCertificate";
import { useToast } from "../components/toastContext";

function formatValue(value) {
  if (value === undefined || value === null || value === "") {
    return "-";
  }

  if (typeof value?.toDate === "function") {
    return value.toDate().toLocaleDateString();
  }

  return String(value);
}

function getCertificateIdentifier(certificate) {
  return certificate?.certificateId || certificate?.id || "";
}

function getVerifyLink(certificateId) {
  return `${window.location.origin}/verify/${certificateId}`;
}

function getFirestoreBadge(status = "unknown") {
  const normalized = status.toLowerCase();

  if (["issued", "confirmed", "active"].includes(normalized)) {
    return "badge badge-success";
  }

  if (["revoked", "failed", "disabled"].includes(normalized)) {
    return "badge badge-error";
  }

  if (["pending", "processing"].includes(normalized)) {
    return "badge badge-warning";
  }

  return "badge";
}

function getVerificationStatus(certificate) {
  const firestoreStatus = String(certificate?.status || "").toLowerCase();
  const blockchainStatus = String(certificate?.blockchainStatus || "").toLowerCase();
  const revocationStatus = String(
    certificate?.blockchainRevocationStatus || "",
  ).toLowerCase();

  if (firestoreStatus === "revoked" || revocationStatus === "confirmed") {
    return {
      label: "Revoked",
      className: "badge badge-error",
      filterValue: "revoked",
    };
  }

  if (
    firestoreStatus === "issued" &&
    ["confirmed", "verified"].includes(blockchainStatus)
  ) {
    return {
      label: "Verified",
      className: "badge badge-success",
      filterValue: "verified",
    };
  }

  if (["failed", "error"].includes(blockchainStatus)) {
    return {
      label: "Blockchain Failed",
      className: "badge badge-error",
      filterValue: "failed",
    };
  }

  return {
    label: "Pending",
    className: "badge badge-warning",
    filterValue: "pending",
  };
}

function getBlockchainBadge(status = "pending") {
  const normalized = status.toLowerCase();

  if (["confirmed", "verified"].includes(normalized)) {
    return "badge badge-success";
  }

  if (["failed", "error"].includes(normalized)) {
    return "badge badge-error";
  }

  if (["pending", "processing"].includes(normalized)) {
    return "badge badge-warning";
  }

  return "badge";
}

function sortCertificates(left, right) {
  const leftDate = Date.parse(left.issueDate || "");
  const rightDate = Date.parse(right.issueDate || "");

  if (!Number.isNaN(leftDate) && !Number.isNaN(rightDate)) {
    return rightDate - leftDate;
  }

  return getCertificateIdentifier(right).localeCompare(getCertificateIdentifier(left));
}

export default function StudentDashboard({ user, role }) {
  const [certificates, setCertificates] = useState([]);
  const [organizationNames, setOrganizationNames] = useState({});
  const [loading, setLoading] = useState(true);
  const [copiedField, setCopiedField] = useState("");
  const [qrCertificate, setQrCertificate] = useState(null);
  const [downloadingCertificateId, setDownloadingCertificateId] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const studentEmail = useMemo(
    () => (user?.email || "").trim().toLowerCase(),
    [user?.email],
  );
  const toast = useToast();

  const fetchCertificates = useCallback(async () => {
    if (!studentEmail) {
      setCertificates([]);
      setOrganizationNames({});
      setLoading(false);
      toast.error("Your student email was not found. Please log in again.");
      return;
    }

    setLoading(true);

    try {
      const certificatesQuery = query(
        collection(db, "certificates"),
        where("studentEmail", "==", studentEmail),
      );
      const certificatesSnap = await getDocs(certificatesQuery);
      const certificateRows = certificatesSnap.docs
        .map((certificateDoc) => ({
          id: certificateDoc.id,
          ...certificateDoc.data(),
          certificateId: certificateDoc.data()?.certificateId || certificateDoc.id,
        }))
        .sort(sortCertificates);

      setCertificates(certificateRows);

      const organizationIds = [
        ...new Set(
          certificateRows
            .map((certificate) => certificate.organizationId)
            .filter(Boolean),
        ),
      ];

      const organizationEntries = await Promise.all(
        organizationIds.map(async (organizationId) => {
          try {
            const organizationSnap = await getDoc(
              doc(db, "organizations", organizationId),
            );

            return [
              organizationId,
              organizationSnap.exists()
                ? organizationSnap.data()?.name || organizationId
                : organizationId,
            ];
          } catch (err) {
            console.error(err);
            return [organizationId, organizationId];
          }
        }),
      );

      setOrganizationNames(Object.fromEntries(organizationEntries));
    } catch (err) {
      console.error(err);
      toast.error("Unable to load your certificates. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [studentEmail, toast]);

  useEffect(() => {
    fetchCertificates();
  }, [fetchCertificates]);

  const stats = useMemo(() => {
    return certificates.reduce(
      (currentStats, certificate) => {
        const verificationStatus = getVerificationStatus(certificate);

        if (verificationStatus.filterValue === "verified") {
          currentStats.verified += 1;
        }

        if (verificationStatus.filterValue === "revoked") {
          currentStats.revoked += 1;
        }

        if (verificationStatus.filterValue === "pending") {
          currentStats.pending += 1;
        }

        return currentStats;
      },
      {
        total: certificates.length,
        verified: 0,
        revoked: 0,
        pending: 0,
      },
    );
  }, [certificates]);

  const filteredCertificates = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return certificates.filter((certificate) => {
      const verificationStatus = getVerificationStatus(certificate);
      const matchesStatus =
        statusFilter === "all" || verificationStatus.filterValue === statusFilter;
      const matchesSearch =
        !normalizedSearch ||
        String(certificate.courseName || "")
          .toLowerCase()
          .includes(normalizedSearch);

      return matchesStatus && matchesSearch;
    });
  }, [certificates, searchTerm, statusFilter]);

  const copyValue = async ({ key, value, successMessage }) => {
    if (!value) {
      toast.warning("Nothing to copy yet.");
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(key);
      toast.success(successMessage);
      window.setTimeout(() => setCopiedField(""), 2000);
    } catch (err) {
      console.error(err);
      toast.error("Could not copy to clipboard. Please copy it manually.");
    }
  };

  const downloadCertificate = async (certificate) => {
    const certificateId = getCertificateIdentifier(certificate);

    if (!certificateId) {
      toast.error("Certificate ID is missing. PDF cannot be generated.");
      return;
    }

    const organizationName =
      certificate.organizationName ||
      organizationNames[certificate.organizationId] ||
      certificate.organizationId ||
      "";

    setDownloadingCertificateId(certificateId);

    try {
      await generateCertificatePdf(
        {
          ...certificate,
          certificateId,
          organizationName,
        },
        { organizationName },
      );
      toast.success("Certificate PDF downloaded.");
    } catch (err) {
      console.error(err);
      toast.error("Could not generate the certificate PDF. Please try again.");
    } finally {
      setDownloadingCertificateId("");
    }
  };

  const handleShareCertificate = async (certificate) => {
    try {
      const result = await shareCertificate(certificate);

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

  const qrCertificateId = getCertificateIdentifier(qrCertificate);
  const qrVerifyLink = qrCertificateId ? getVerifyLink(qrCertificateId) : "";

  return (
    <Navbar user={user} role={role}>
      <div className="grid">
        <section className="card">
          <div className="section-header">
            <div>
              <p className="eyebrow">Student Wallet</p>
              <h2>Welcome back</h2>
              <p className="muted">
                Signed in as <strong>{studentEmail || "unknown email"}</strong>
              </p>
            </div>
            <button
              type="button"
              onClick={fetchCertificates}
              disabled={loading}
              className="button button-outline"
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </section>

        <div className="grid grid-four">
          <section className="card stat-card">
            <span className="muted">Total certificates</span>
            <strong className="stat-value">{stats.total}</strong>
          </section>
          <section className="card stat-card">
            <span className="muted">Verified on blockchain</span>
            <strong className="stat-value">{stats.verified}</strong>
          </section>
          <section className="card stat-card">
            <span className="muted">Revoked</span>
            <strong className="stat-value">{stats.revoked}</strong>
          </section>
          <section className="card stat-card">
            <span className="muted">Pending blockchain</span>
            <strong className="stat-value">{stats.pending}</strong>
          </section>
        </div>

        <section className="card">
          <div className="section-header">
            <div>
              <h2>Certificates</h2>
              <p className="muted">
                Your certificates are matched to your signed-in student email.
              </p>
            </div>
          </div>

          <div className="form-grid" style={{ marginBottom: 16 }}>
            <label className="field">
              <span>Search course</span>
              <input
                className="input"
                placeholder="Course name"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </label>
            <label className="field">
              <span>Verification status</span>
              <select
                className="input"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="all">All statuses</option>
                <option value="verified">Verified</option>
                <option value="revoked">Revoked</option>
                <option value="pending">Pending</option>
                <option value="failed">Blockchain Failed</option>
              </select>
            </label>
          </div>

          {loading ? <div className="alert">Loading certificates...</div> : null}

          {!loading && certificates.length === 0 ? (
            <div className="empty-state">
              <strong>No certificates found yet.</strong>
              <span>Certificates issued to {studentEmail || "this email"} will appear here.</span>
            </div>
          ) : null}

          {!loading && certificates.length > 0 && filteredCertificates.length === 0 ? (
            <div className="empty-state">
              <strong>No matching certificates</strong>
              <span>Try a different course name or status filter.</span>
            </div>
          ) : null}

          {!loading && filteredCertificates.length > 0 ? (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Certificate ID</th>
                    <th>Student</th>
                    <th>Course</th>
                    <th>Organization</th>
                    <th>Status</th>
                    <th>Blockchain</th>
                    <th>Verification</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCertificates.map((certificate) => {
                    const certificateId = getCertificateIdentifier(certificate);
                    const verifyLink = getVerifyLink(certificateId);
                    const verificationStatus = getVerificationStatus(certificate);
                    const organizationName =
                      certificate.organizationName ||
                      organizationNames[certificate.organizationId] ||
                      certificate.organizationId ||
                      "-";
                    const isDownloading = downloadingCertificateId === certificateId;

                    return (
                      <tr key={certificate.id}>
                        <td>
                          <div className="proof-cell">
                            <span className="hash-value">{certificateId}</span>
                            <button
                              type="button"
                              onClick={() =>
                                copyValue({
                                  key: `id-${certificateId}`,
                                  value: certificateId,
                                  successMessage: "Certificate ID copied.",
                                })
                              }
                              className="button button-outline button-small"
                            >
                              {copiedField === `id-${certificateId}`
                                ? "Copied"
                                : "Copy ID"}
                            </button>
                          </div>
                        </td>
                        <td>
                          <strong>{formatValue(certificate.studentName)}</strong>
                          <p className="muted">{formatValue(certificate.studentEmail)}</p>
                        </td>
                        <td>
                          <strong>{formatValue(certificate.courseName)}</strong>
                          <p className="muted">{formatValue(certificate.issueDate)}</p>
                        </td>
                        <td>{organizationName}</td>
                        <td>
                          <span className={getFirestoreBadge(certificate.status)}>
                            {certificate.status || "unknown"}
                          </span>
                        </td>
                        <td>
                          <span
                            className={getBlockchainBadge(
                              certificate.blockchainStatus || "pending",
                            )}
                          >
                            {certificate.blockchainStatus || "pending"}
                          </span>
                        </td>
                        <td>
                          <span className={verificationStatus.className}>
                            {verificationStatus.label}
                          </span>
                        </td>
                        <td>
                          <div className="action-group">
                            <Link
                              to={`/verify/${certificateId}`}
                              className="button button-tonal button-small"
                            >
                              Open Verify Page
                            </Link>
                            <button
                              type="button"
                              onClick={() =>
                                copyValue({
                                  key: `link-${certificateId}`,
                                  value: verifyLink,
                                  successMessage: "Verify link copied.",
                                })
                              }
                              className="button button-outline button-small"
                            >
                              {copiedField === `link-${certificateId}`
                                ? "Copied"
                                : "Copy Verify Link"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setQrCertificate(certificate)}
                              className="button button-outline button-small"
                            >
                              Show QR
                            </button>
                            <button
                              type="button"
                              onClick={() => handleShareCertificate(certificate)}
                              className="button button-outline button-small"
                            >
                              Share
                            </button>
                            <button
                              type="button"
                              onClick={() => downloadCertificate(certificate)}
                              disabled={isDownloading}
                              className="button button-outline button-small"
                            >
                              {isDownloading ? "Generating..." : "Download PDF"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      </div>

      {qrCertificate ? (
        <div className="modal-backdrop">
          <section className="modal">
            <div className="section-header">
              <div>
                <h2>Verification QR</h2>
                <p className="muted hash-value">ID: {qrCertificateId}</p>
              </div>
              <button
                type="button"
                onClick={() => setQrCertificate(null)}
                className="button button-tonal button-small"
              >
                Close
              </button>
            </div>

            <div className="qr-box">
              <QRCodeCanvas value={qrVerifyLink} size={220} level="M" includeMargin />
            </div>

            <a href={`/verify/${qrCertificateId}`} className="hash-value">
              {qrVerifyLink}
            </a>

            <div className="button-row" style={{ marginTop: 16 }}>
              <button
                type="button"
                onClick={() =>
                  copyValue({
                    key: `qr-link-${qrCertificateId}`,
                    value: qrVerifyLink,
                    successMessage: "Verify link copied.",
                  })
                }
                className="button"
              >
                {copiedField === `qr-link-${qrCertificateId}`
                  ? "Copied"
                  : "Copy Verification Link"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </Navbar>
  );
}
