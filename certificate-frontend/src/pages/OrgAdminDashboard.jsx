import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { QRCodeCanvas } from "qrcode.react";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../firebase";
import AppLayout from "../components/AppLayout";
import { generateCertificatePdf } from "../utils/certificatePdf";
import { shareCertificate } from "../utils/shareCertificate";
import { useToast } from "../components/toastContext";

const emptyTeacherForm = {
  name: "",
  email: "",
  password: "",
};

const emptyCertificateForm = {
  studentName: "",
  studentEmail: "",
  courseName: "",
  issueDate: "",
};

const MAX_BULK_CERTIFICATES = 200;
const BULK_CSV_HEADER = "studentName,studentEmail,courseName,issueDate";

const AMOY_TX_BASE_URL = "https://amoy.polygonscan.com/tx/";

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let insideQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const nextCharacter = line[index + 1];

    if (character === '"' && nextCharacter === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (character === '"') {
      insideQuotes = !insideQuotes;
      continue;
    }

    if (character === "," && !insideQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += character;
  }

  cells.push(current.trim());

  return cells;
}

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]/g, "");
}

function hasBulkHeader(cells) {
  const expectedHeaders = [
    "studentname",
    "studentemail",
    "coursename",
    "issuedate",
  ];

  return expectedHeaders.every(
    (header, index) => normalizeHeader(cells[index]) === header,
  );
}

function parseBulkCertificateInput(input) {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const validationErrors = [];

  if (lines.length === 0) {
    return {
      rows: [],
      validationErrors: ["Add at least one certificate row."],
    };
  }

  const firstCells = parseCsvLine(lines[0]);
  const dataLines = hasBulkHeader(firstCells) ? lines.slice(1) : lines;

  if (dataLines.length === 0) {
    return {
      rows: [],
      validationErrors: ["Add certificate rows below the CSV header."],
    };
  }

  if (dataLines.length > MAX_BULK_CERTIFICATES) {
    validationErrors.push(
      `Bulk issuance is limited to ${MAX_BULK_CERTIFICATES} certificates per batch.`,
    );
  }

  const rows = dataLines.map((line, index) => {
    const rowNumber = index + 1;
    const cells = parseCsvLine(line);
    const [studentName = "", studentEmail = "", courseName = "", issueDate = ""] =
      cells;
    const row = {
      studentName: studentName.trim(),
      studentEmail: studentEmail.trim().toLowerCase(),
      courseName: courseName.trim(),
      issueDate: issueDate.trim(),
    };

    if (cells.length !== 4) {
      validationErrors.push(
        `Row ${rowNumber}: expected 4 comma-separated fields.`,
      );
    }

    if (!row.studentName) {
      validationErrors.push(`Row ${rowNumber}: studentName is required.`);
    }

    if (!row.studentEmail || !row.studentEmail.includes("@")) {
      validationErrors.push(
        `Row ${rowNumber}: a valid studentEmail is required.`,
      );
    }

    if (!row.courseName) {
      validationErrors.push(`Row ${rowNumber}: courseName is required.`);
    }

    if (!row.issueDate) {
      validationErrors.push(`Row ${rowNumber}: issueDate is required.`);
    }

    return row;
  });

  return {
    rows,
    validationErrors,
  };
}

function getReadableError(error) {
  if (error?.code === "functions/already-exists") {
    return "A user with this email already exists.";
  }

  if (error?.code === "functions/permission-denied") {
    return "You do not have permission to perform this action.";
  }

  if (error?.code === "functions/unauthenticated") {
    return "Please log in again before continuing.";
  }

  if (error?.code === "functions/invalid-argument") {
    return error.message || "Please check the form and try again.";
  }

  if (error?.code === "functions/failed-precondition") {
    return error.message || "This action cannot be completed right now.";
  }

  return error?.message || "Something went wrong. Please try again.";
}

function getCertificateIdentifier(certificate) {
  return certificate?.certificateId || certificate?.id || "";
}

function getVerifyLink(certificateId) {
  return `${window.location.origin}/verify/${certificateId}`;
}

function getTxLink(txHash) {
  return txHash ? `${AMOY_TX_BASE_URL}${txHash}` : "";
}

function truncateMiddle(value = "", visible = 10) {
  if (!value || value.length <= visible * 2 + 3) return value;
  return `${value.slice(0, visible)}...${value.slice(-visible)}`;
}

function getStatusBadge(status = "unknown") {
  const normalized = status.toLowerCase();

  if (["issued", "confirmed", "active", "sent", "uploaded"].includes(normalized)) {
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

function CertificateTable({
  certificates,
  loading,
  copiedCertificateId,
  downloadingCertificateId,
  organizationName,
  revokingCertificateId,
  onRefresh,
  onCopy,
  onDownload,
  onOpenQr,
  onRevoke,
  onShare,
}) {
  return (
    <section className="card">
      <div className="section-header">
        <div>
          <h2>Issued Certificates</h2>
          <p className="muted">Track Firestore status and blockchain proof.</p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="button button-outline"
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {loading ? <div className="alert">Loading certificates...</div> : null}

      {!loading && certificates.length === 0 ? (
        <div className="empty-state">
          <strong>No certificates issued yet</strong>
          <span>Newly issued certificates will appear here.</span>
        </div>
      ) : null}

      {!loading && certificates.length > 0 ? (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Certificate ID</th>
                <th>Student</th>
                <th>Course</th>
                <th>Firestore</th>
                <th>Blockchain</th>
                <th>Email</th>
                <th>IPFS</th>
                <th>Verify</th>
                <th>Revoke</th>
              </tr>
            </thead>
            <tbody>
              {certificates.map((certificate) => {
                const certificateId = getCertificateIdentifier(certificate);
                const isCopied = copiedCertificateId === certificateId;
                const isRevoked = certificate.status === "revoked";
                const isRevoking = revokingCertificateId === certificateId;
                const isDownloading = downloadingCertificateId === certificateId;

                return (
                  <tr key={certificate.id}>
                    <td>
                      <div className="hash-value">{certificateId}</div>
                    </td>
                    <td>
                      <strong>{certificate.studentName || "-"}</strong>
                      <p className="muted">{certificate.studentEmail || "-"}</p>
                    </td>
                    <td>
                      <strong>{certificate.courseName || "-"}</strong>
                      <p className="muted">{certificate.issueDate || "-"}</p>
                    </td>
                    <td>
                      <span className={getStatusBadge(certificate.status)}>
                        {certificate.status || "unknown"}
                      </span>
                    </td>
                    <td>
                      <div className="proof-cell">
                        <span
                          className={getStatusBadge(
                            certificate.blockchainStatus || "pending",
                          )}
                        >
                          {certificate.blockchainStatus || "pending"}
                        </span>

                        {certificate.blockchainTxHash ? (
                          <a
                            href={getTxLink(certificate.blockchainTxHash)}
                            target="_blank"
                            rel="noreferrer"
                            title={certificate.blockchainTxHash}
                          >
                            {certificate.issuanceMode === "bulk" ? "Batch tx" : "Tx"}{" "}
                            {truncateMiddle(certificate.blockchainTxHash)}
                          </a>
                        ) : null}

                        {certificate.blockchainRevocationStatus ? (
                          <span
                            className={getStatusBadge(
                              certificate.blockchainRevocationStatus,
                            )}
                          >
                            Revocation {certificate.blockchainRevocationStatus}
                          </span>
                        ) : null}

                        {certificate.revokeTxHash ? (
                          <a
                            href={getTxLink(certificate.revokeTxHash)}
                            target="_blank"
                            rel="noreferrer"
                            title={certificate.revokeTxHash}
                          >
                            Revoke tx {truncateMiddle(certificate.revokeTxHash)}
                          </a>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      {certificate.emailStatus ? (
                        <span className={getStatusBadge(certificate.emailStatus)}>
                          {certificate.emailStatus}
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td>
                      <div className="proof-cell">
                        {certificate.ipfsStatus ? (
                          <span className={getStatusBadge(certificate.ipfsStatus)}>
                            {certificate.ipfsStatus}
                          </span>
                        ) : (
                          "-"
                        )}
                        {certificate.ipfsGatewayUrl ? (
                          <a
                            href={certificate.ipfsGatewayUrl}
                            target="_blank"
                            rel="noreferrer"
                            title={certificate.ipfsCid || certificate.ipfsGatewayUrl}
                          >
                            IPFS {truncateMiddle(certificate.ipfsCid || "metadata")}
                          </a>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      <div className="action-group">
                        <Link
                          to={`/verify/${certificateId}`}
                          className="button button-tonal button-small"
                        >
                          Open
                        </Link>
                        <button
                          type="button"
                          onClick={() => onCopy(certificate)}
                          className="button button-outline button-small"
                        >
                          {isCopied ? "Copied" : "Copy"}
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenQr(certificate)}
                          className="button button-outline button-small"
                        >
                          QR
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onShare({
                              ...certificate,
                              organizationName:
                                certificate.organizationName ||
                                organizationName ||
                                certificate.organizationId ||
                                "",
                            })
                          }
                          className="button button-outline button-small"
                        >
                          Share
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onDownload({
                              ...certificate,
                              organizationName:
                                certificate.organizationName ||
                                organizationName ||
                                certificate.organizationId ||
                                "",
                            })
                          }
                          disabled={isDownloading}
                          className="button button-outline button-small"
                        >
                          {isDownloading ? "Generating..." : "Download PDF"}
                        </button>
                      </div>
                    </td>
                    <td>
                      {isRevoked ? (
                        <span className="badge badge-error">Revoked</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onRevoke(certificate)}
                          disabled={isRevoking}
                          className="button button-danger button-small"
                        >
                          {isRevoking ? "Revoking..." : "Revoke"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

export default function OrgAdminDashboard({ user }) {
  const [profile, setProfile] = useState(null);
  const [organizationName, setOrganizationName] = useState("");
  const [teachers, setTeachers] = useState([]);
  const [certificates, setCertificates] = useState([]);
  const [teacherForm, setTeacherForm] = useState(emptyTeacherForm);
  const [certificateForm, setCertificateForm] = useState(emptyCertificateForm);
  const [bulkCsvInput, setBulkCsvInput] = useState("");
  const [bulkRows, setBulkRows] = useState([]);
  const [bulkValidationErrors, setBulkValidationErrors] = useState([]);
  const [bulkPreviewReady, setBulkPreviewReady] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [teachersLoading, setTeachersLoading] = useState(false);
  const [certificatesLoading, setCertificatesLoading] = useState(false);
  const [creatingTeacher, setCreatingTeacher] = useState(false);
  const [issuingCertificate, setIssuingCertificate] = useState(false);
  const [issuingBulkCertificates, setIssuingBulkCertificates] = useState(false);
  const [revokingTeacherId, setRevokingTeacherId] = useState("");
  const [revokingCertificateId, setRevokingCertificateId] = useState("");
  const [downloadingCertificateId, setDownloadingCertificateId] = useState("");
  const [copiedCertificateId, setCopiedCertificateId] = useState("");
  const [qrCertificate, setQrCertificate] = useState(null);
  const [error, setError] = useState("");
  const toast = useToast();

  const createTeacherFn = useMemo(
    () => httpsCallable(functions, "createTeacher"),
    [],
  );
  const revokeTeacherFn = useMemo(
    () => httpsCallable(functions, "revokeTeacher"),
    [],
  );
  const issueCertificateFn = useMemo(
    () => httpsCallable(functions, "issueCertificate"),
    [],
  );
  const issueBulkCertificatesFn = useMemo(
    () => httpsCallable(functions, "issueBulkCertificates"),
    [],
  );
  const revokeCertificateFn = useMemo(
    () => httpsCallable(functions, "revokeCertificate"),
    [],
  );

  const organizationId = profile?.organizationId || "";
  const isOrgAdmin = profile?.role === "orgAdmin";
  const isTeacher = profile?.role === "teacher";

  const fetchTeachers = useCallback(async (orgId) => {
    if (!orgId) {
      setTeachers([]);
      return;
    }

    setTeachersLoading(true);

    try {
      const teacherQuery = query(
        collection(db, "users"),
        where("organizationId", "==", orgId),
      );
      const teacherSnap = await getDocs(teacherQuery);

      setTeachers(
        teacherSnap.docs
          .map((teacherDoc) => ({
            id: teacherDoc.id,
            ...teacherDoc.data(),
          }))
          .filter((teacher) => teacher.role === "teacher"),
      );
    } catch (err) {
      console.error(err);
      setError("Failed to load teachers for this organization.");
      toast.error("Failed to load teachers for this organization.");
    } finally {
      setTeachersLoading(false);
    }
  }, [toast]);

  const fetchCertificates = useCallback(async (teacherUid) => {
    if (!teacherUid) {
      setCertificates([]);
      return;
    }

    setCertificatesLoading(true);

    try {
      const certificatesQuery = query(
        collection(db, "certificates"),
        where("issuedBy", "==", teacherUid),
      );
      const certificatesSnap = await getDocs(certificatesQuery);

      setCertificates(
        certificatesSnap.docs.map((certificateDoc) => ({
          id: certificateDoc.id,
          ...certificateDoc.data(),
        })),
      );
    } catch (err) {
      console.error(err);
      setError("Failed to load your issued certificates.");
      toast.error("Failed to load your issued certificates.");
    } finally {
      setCertificatesLoading(false);
    }
  }, [toast]);

  const fetchProfile = useCallback(async () => {
    if (!user?.uid) return;

    setPageLoading(true);
    setError("");
    setOrganizationName("");

    try {
      const profileSnap = await getDoc(doc(db, "users", user.uid));

      if (!profileSnap.exists()) {
        setProfile(null);
        setError("Your user profile was not found.");
        toast.error("Your user profile was not found.");
        return;
      }

      const profileData = {
        id: profileSnap.id,
        ...profileSnap.data(),
      };

      setProfile(profileData);

      if (profileData.organizationId) {
        const organizationSnap = await getDoc(
          doc(db, "organizations", profileData.organizationId),
        );

        setOrganizationName(
          organizationSnap.exists() ? organizationSnap.data()?.name || "" : "",
        );
      }

      if (profileData.role === "orgAdmin") {
        await fetchTeachers(profileData.organizationId);
      }

      if (profileData.role === "teacher") {
        await fetchCertificates(user.uid);
      }
    } catch (err) {
      console.error(err);
      setError("Failed to load your dashboard profile.");
      toast.error("Failed to load your dashboard profile.");
    } finally {
      setPageLoading(false);
    }
  }, [fetchCertificates, fetchTeachers, toast, user?.uid]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const updateTeacherForm = (field, value) => {
    setTeacherForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const updateCertificateForm = (field, value) => {
    setCertificateForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const updateBulkCsvInput = (value) => {
    setBulkCsvInput(value);
    setBulkRows([]);
    setBulkValidationErrors([]);
    setBulkPreviewReady(false);
  };

  const copyVerifyLink = async (certificate) => {
    const currentCertificateId = getCertificateIdentifier(certificate);
    const verifyLink = getVerifyLink(currentCertificateId);

    try {
      await navigator.clipboard.writeText(verifyLink);
      setCopiedCertificateId(currentCertificateId);
      toast.success("Verify link copied.");
      window.setTimeout(() => setCopiedCertificateId(""), 2000);
    } catch (err) {
      console.error(err);
      toast.error("Could not copy verify link. Please copy it from the link.");
    }
  };

  const downloadCertificate = async (certificate) => {
    const currentCertificateId = getCertificateIdentifier(certificate);

    if (!currentCertificateId) {
      toast.error("Certificate ID is missing. PDF cannot be generated.");
      return;
    }

    setDownloadingCertificateId(currentCertificateId);
    setError("");

    try {
      await generateCertificatePdf(
        {
          ...certificate,
          certificateId: currentCertificateId,
          organizationName:
            certificate.organizationName ||
            organizationName ||
            certificate.organizationId ||
            "",
        },
        {
          organizationName:
            certificate.organizationName ||
            organizationName ||
            certificate.organizationId ||
            "",
        },
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
    const currentCertificateId = getCertificateIdentifier(certificate);

    if (!currentCertificateId) {
      toast.error("Certificate ID is missing.");
      return;
    }

    try {
      const result = await shareCertificate({
        ...certificate,
        certificateId: currentCertificateId,
        organizationName:
          certificate.organizationName ||
          organizationName ||
          certificate.organizationId ||
          "",
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

  const createTeacher = async (event) => {
    event.preventDefault();
    setError("");

    const name = teacherForm.name.trim();
    const email = teacherForm.email.trim();
    const password = teacherForm.password;

    if (!name || !email || !password.trim()) {
      toast.warning("Name, email, and temporary password are required.");
      return;
    }

    if (password.length < 6) {
      toast.warning("Temporary password must be at least 6 characters.");
      return;
    }

    try {
      setCreatingTeacher(true);
      await user.getIdToken(true);

      await createTeacherFn({
        name,
        email,
        password,
      });

      setTeacherForm(emptyTeacherForm);
      toast.success("Teacher created successfully. Invite email sent.");
      await fetchTeachers(organizationId);
    } catch (err) {
      console.error(err);
      toast.error(getReadableError(err));
    } finally {
      setCreatingTeacher(false);
    }
  };

  const revokeTeacher = async (teacher) => {
    const confirmRevoke = window.confirm(
      `Revoke ${teacher.email || "this teacher"}?`,
    );

    if (!confirmRevoke) return;

    setError("");

    try {
      setRevokingTeacherId(teacher.id);
      await user.getIdToken(true);

      await revokeTeacherFn({
        uid: teacher.uid || teacher.id,
      });

      toast.success("Teacher revoked successfully.");
      await fetchTeachers(organizationId);
    } catch (err) {
      console.error(err);
      toast.error(getReadableError(err));
    } finally {
      setRevokingTeacherId("");
    }
  };

  const issueCertificate = async (event) => {
    event.preventDefault();
    setError("");

    const studentName = certificateForm.studentName.trim();
    const studentEmail = certificateForm.studentEmail.trim();
    const courseName = certificateForm.courseName.trim();
    const issueDate = certificateForm.issueDate.trim();

    if (!studentName || !studentEmail || !courseName || !issueDate) {
      toast.warning(
        "Student name, student email, course name, and issue date are required.",
      );
      return;
    }

    try {
      setIssuingCertificate(true);
      await user.getIdToken(true);

      const result = await issueCertificateFn({
        studentName,
        studentEmail,
        courseName,
        issueDate,
      });

      setCertificateForm(emptyCertificateForm);
      toast.success(
        `Certificate issued successfully. ID: ${result.data.certificateId}`,
      );
      await fetchCertificates(user.uid);
    } catch (err) {
      console.error(err);
      toast.error(getReadableError(err));
    } finally {
      setIssuingCertificate(false);
    }
  };

  const previewBulkCertificates = () => {
    setError("");

    const { rows, validationErrors } =
      parseBulkCertificateInput(bulkCsvInput);

    setBulkRows(rows);
    setBulkValidationErrors(validationErrors);
    setBulkPreviewReady(validationErrors.length === 0 && rows.length > 0);

    if (validationErrors.length > 0) {
      toast.warning("Fix the highlighted bulk rows before issuing.");
      return;
    }

    toast.info(`Preview ready for ${rows.length} bulk certificate row(s).`);
  };

  const issueBulkCertificates = async () => {
    setError("");

    if (
      !bulkPreviewReady ||
      bulkValidationErrors.length > 0 ||
      bulkRows.length === 0
    ) {
      toast.warning("Preview valid bulk rows before issuing.");
      return;
    }

    try {
      setIssuingBulkCertificates(true);
      await user.getIdToken(true);

      const result = await issueBulkCertificatesFn({
        certificates: bulkRows,
      });
      const batchId = result.data?.batchId || "";
      const count = result.data?.count || bulkRows.length;
      const blockchainStatus = result.data?.blockchainStatus || "pending";

      setBulkCsvInput("");
      setBulkRows([]);
      setBulkValidationErrors([]);
      setBulkPreviewReady(false);
      toast.success(
        batchId
          ? `Bulk batch created successfully. Batch ID: ${batchId}. Count: ${count}. Blockchain: ${blockchainStatus}.`
          : `Bulk batch created successfully. Count: ${count}. Blockchain: ${blockchainStatus}.`,
      );
      await fetchCertificates(user.uid);
    } catch (err) {
      console.error(err);
      toast.error(getReadableError(err));
    } finally {
      setIssuingBulkCertificates(false);
    }
  };

  const revokeCertificate = async (certificate) => {
    const currentCertificateId = getCertificateIdentifier(certificate);

    if (!currentCertificateId) {
      toast.error("Certificate ID is missing.");
      return;
    }

    const confirmRevoke = window.confirm(
      `Revoke certificate ${currentCertificateId}?`,
    );

    if (!confirmRevoke) return;

    setError("");

    if (certificate?.blockchainStatus !== "confirmed") {
      toast.warning("Only blockchain-confirmed certificates can be revoked.");
      return;
    }

    try {
      setRevokingCertificateId(currentCertificateId);
      await user.getIdToken(true);

      const result = await revokeCertificateFn({
        certificateId: currentCertificateId,
      });
      const revokeTxHash = result.data?.revokeTxHash;

      toast.success(
        revokeTxHash
          ? `Certificate revoked successfully. Revoke tx: ${revokeTxHash}`
          : "Certificate revoked successfully.",
      );
      await fetchCertificates(user.uid);
    } catch (err) {
      console.error(err);
      toast.error(getReadableError(err));
      await fetchCertificates(user.uid);
    } finally {
      setRevokingCertificateId("");
    }
  };

  const qrCertificateId = getCertificateIdentifier(qrCertificate);
  const qrVerifyLink = qrCertificateId ? getVerifyLink(qrCertificateId) : "";

  if (pageLoading) {
    return <div className="loading-screen">Loading dashboard...</div>;
  }

  if (!isOrgAdmin && !isTeacher) {
    return (
      <AppLayout
        user={user}
        role={profile?.role}
        title="Dashboard unavailable"
        subtitle="This dashboard is only available to organization users."
        navItems={[{ to: "/dashboard", label: "Dashboard", icon: "D" }]}
      >
        <div className="alert alert-error">
          {error || "This dashboard is only available to organization users."}
        </div>
      </AppLayout>
    );
  }

  const navItems = [
    { to: "/dashboard", label: isTeacher ? "Teacher" : "Org Admin", icon: "D" },
  ];

  return (
    <AppLayout
      user={user}
      role={profile?.role}
      title={isTeacher ? "Teacher Dashboard" : "Org Admin Dashboard"}
      subtitle={`${organizationName || "Unknown Organization"} · ${
        profile?.email || user?.email
      }`}
      navItems={navItems}
      actions={
        <span className={getStatusBadge(profile?.status || "active")}>
          {profile?.status || "active"}
        </span>
      }
    >
      <div className="grid">
        <div className="grid grid-three">
          <section className="card stat-card">
            <span className="muted">Role</span>
            <strong className="stat-value">
              {isTeacher ? "Teacher" : "Org Admin"}
            </strong>
          </section>
          <section className="card stat-card">
            <span className="muted">
              {isTeacher ? "Issued Certificates" : "Teachers"}
            </span>
            <strong className="stat-value">
              {isTeacher ? certificates.length : teachers.length}
            </strong>
          </section>
          <section className="card stat-card">
            <span className="muted">Organization ID</span>
            <strong className="hash-value">{organizationId || "-"}</strong>
          </section>
        </div>

        {isTeacher ? (
          <>
            <section className="card">
              <div className="section-header">
                <div>
                  <h2>Issue Certificate</h2>
                  <p className="muted">
                    Create a certificate record and submit it for blockchain proof.
                  </p>
                </div>
              </div>

              <form className="form-grid" onSubmit={issueCertificate}>
                <label className="field">
                  <span>Student Name</span>
                  <input
                    className="input"
                    placeholder="Student name"
                    value={certificateForm.studentName}
                    onChange={(event) =>
                      updateCertificateForm("studentName", event.target.value)
                    }
                    disabled={issuingCertificate}
                  />
                </label>

                <label className="field">
                  <span>Student Email</span>
                  <input
                    className="input"
                    placeholder="student@example.com"
                    type="email"
                    value={certificateForm.studentEmail}
                    onChange={(event) =>
                      updateCertificateForm("studentEmail", event.target.value)
                    }
                    disabled={issuingCertificate}
                  />
                </label>

                <label className="field">
                  <span>Course Name</span>
                  <input
                    className="input"
                    placeholder="Course name"
                    value={certificateForm.courseName}
                    onChange={(event) =>
                      updateCertificateForm("courseName", event.target.value)
                    }
                    disabled={issuingCertificate}
                  />
                </label>

                <label className="field">
                  <span>Issue Date</span>
                  <input
                    className="input"
                    type="date"
                    value={certificateForm.issueDate}
                    onChange={(event) =>
                      updateCertificateForm("issueDate", event.target.value)
                    }
                    disabled={issuingCertificate}
                  />
                </label>

                <button
                  type="submit"
                  disabled={issuingCertificate}
                  className="button full-width"
                >
                  {issuingCertificate ? "Issuing..." : "Issue Certificate"}
                </button>
              </form>
            </section>

            <section className="card">
              <div className="section-header">
                <div>
                  <h2>Bulk Issue Certificates</h2>
                  <p className="muted">
                    Paste CSV rows, preview validation, then create a Merkle batch.
                  </p>
                </div>
                {bulkPreviewReady ? (
                  <span className="badge badge-success">
                    {bulkRows.length} ready
                  </span>
                ) : null}
              </div>

              <div className="form-grid">
                <label className="field full-width">
                  <span>CSV Rows</span>
                  <textarea
                    className="input textarea"
                    rows={7}
                    placeholder={`${BULK_CSV_HEADER}\nAyesha Khan,ayesha@example.com,Blockchain Basics,2026-05-12\nAli Raza,ali@example.com,Smart Contracts,2026-05-12`}
                    value={bulkCsvInput}
                    onChange={(event) => updateBulkCsvInput(event.target.value)}
                    disabled={issuingBulkCertificates}
                  />
                </label>

                <div className="button-row full-width">
                  <button
                    type="button"
                    onClick={previewBulkCertificates}
                    disabled={issuingBulkCertificates || !bulkCsvInput.trim()}
                    className="button button-outline"
                  >
                    Preview Rows
                  </button>
                  <button
                    type="button"
                    onClick={issueBulkCertificates}
                    disabled={
                      issuingBulkCertificates ||
                      !bulkPreviewReady ||
                      bulkValidationErrors.length > 0
                    }
                    className="button"
                  >
                    {issuingBulkCertificates ? "Issuing..." : "Issue Bulk Batch"}
                  </button>
                </div>
              </div>

              {bulkValidationErrors.length > 0 ? (
                <div className="alert alert-error bulk-errors">
                  {bulkValidationErrors.slice(0, 6).map((validationError) => (
                    <span key={validationError}>{validationError}</span>
                  ))}
                  {bulkValidationErrors.length > 6 ? (
                    <span>
                      {bulkValidationErrors.length - 6} more validation issue(s).
                    </span>
                  ) : null}
                </div>
              ) : null}

              {bulkRows.length > 0 ? (
                <div className="table-container bulk-preview-table">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Student</th>
                        <th>Email</th>
                        <th>Course</th>
                        <th>Issue Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bulkRows.map((row, index) => (
                        <tr
                          key={`${row.studentEmail}-${row.courseName}-${index}`}
                        >
                          <td>{index + 1}</td>
                          <td>{row.studentName || "-"}</td>
                          <td>{row.studentEmail || "-"}</td>
                          <td>{row.courseName || "-"}</td>
                          <td>{row.issueDate || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </section>

            <CertificateTable
              certificates={certificates}
              loading={certificatesLoading}
              copiedCertificateId={copiedCertificateId}
              downloadingCertificateId={downloadingCertificateId}
              organizationName={organizationName}
              revokingCertificateId={revokingCertificateId}
              onRefresh={() => fetchCertificates(user.uid)}
              onCopy={copyVerifyLink}
              onDownload={downloadCertificate}
              onOpenQr={setQrCertificate}
              onRevoke={revokeCertificate}
              onShare={handleShareCertificate}
            />
          </>
        ) : null}

        {isOrgAdmin ? (
          <>
            <section className="card">
              <div className="section-header">
                <div>
                  <h2>Create Teacher</h2>
                  <p className="muted">
                    Add a teacher to your organization and send their invite.
                  </p>
                </div>
              </div>

              <form className="form-grid" onSubmit={createTeacher}>
                <label className="field">
                  <span>Teacher Name</span>
                  <input
                    className="input"
                    placeholder="Teacher name"
                    value={teacherForm.name}
                    onChange={(event) =>
                      updateTeacherForm("name", event.target.value)
                    }
                    disabled={creatingTeacher}
                  />
                </label>

                <label className="field">
                  <span>Teacher Email</span>
                  <input
                    className="input"
                    placeholder="teacher@example.com"
                    type="email"
                    value={teacherForm.email}
                    onChange={(event) =>
                      updateTeacherForm("email", event.target.value)
                    }
                    disabled={creatingTeacher}
                  />
                </label>

                <label className="field full-width">
                  <span>Temporary Password</span>
                  <input
                    className="input"
                    placeholder="Minimum 6 characters"
                    type="password"
                    value={teacherForm.password}
                    onChange={(event) =>
                      updateTeacherForm("password", event.target.value)
                    }
                    disabled={creatingTeacher}
                  />
                </label>

                <button
                  type="submit"
                  disabled={creatingTeacher}
                  className="button full-width"
                >
                  {creatingTeacher ? "Creating..." : "Create Teacher"}
                </button>
              </form>
            </section>

            <section className="card">
              <div className="section-header">
                <div>
                  <h2>Teachers</h2>
                  <p className="muted">Manage teacher access for this organization.</p>
                </div>
                <button
                  type="button"
                  onClick={() => fetchTeachers(organizationId)}
                  disabled={teachersLoading}
                  className="button button-outline"
                >
                  {teachersLoading ? "Refreshing..." : "Refresh"}
                </button>
              </div>

              {teachersLoading ? <div className="alert">Loading teachers...</div> : null}

              {!teachersLoading && teachers.length === 0 ? (
                <div className="empty-state">
                  <strong>No active teachers found</strong>
                  <span>Create a teacher account to start issuing certificates.</span>
                </div>
              ) : null}

              {!teachersLoading && teachers.length > 0 ? (
                <div className="table-container">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {teachers.map((teacher) => (
                        <tr key={teacher.id}>
                          <td>{teacher.name || "-"}</td>
                          <td>{teacher.email || "-"}</td>
                          <td>
                            <span className={getStatusBadge(teacher.status)}>
                              {teacher.status || "unknown"}
                            </span>
                          </td>
                          <td>
                            <button
                              type="button"
                              onClick={() => revokeTeacher(teacher)}
                              disabled={revokingTeacherId === teacher.id}
                              className="button button-danger button-small"
                            >
                              {revokingTeacherId === teacher.id
                                ? "Revoking..."
                                : "Revoke"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </section>
          </>
        ) : null}
      </div>

      {qrCertificate ? (
        <div className="modal-backdrop">
          <section className="modal">
            <div className="section-header">
              <div>
                <h2>Certificate QR</h2>
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
                onClick={() => copyVerifyLink(qrCertificate)}
                className="button"
              >
                {copiedCertificateId === qrCertificateId
                  ? "Copied"
                  : "Copy Verification Link"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </AppLayout>
  );
}
