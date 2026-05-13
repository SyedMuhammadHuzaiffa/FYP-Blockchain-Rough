import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { QRCodeCanvas } from "qrcode.react";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../firebase";
import AppLayout from "../components/AppLayout";
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
  certificateTitle: "Certificate of Achievement",
  certificateSubtitle: "This is proudly presented to",
  description: "",
  gradeOrResult: "",
  duration: "",
  venue: "",
  instructorName: "",
  remarks: "",
  certificateDesign: "classicAcademic",
  certificateTemplateDataUrl: "",
  aiDesignPrompt: "",
  aiDesignSuggestion: null,
};

const MAX_BULK_CERTIFICATES = 200;
const MAX_TEMPLATE_DATA_URL_LENGTH = 900000;
const BULK_CSV_HEADER =
  "studentName,studentEmail,courseName,issueDate,certificateTitle,description,gradeOrResult,duration,venue,instructorName,remarks";
const CERTIFICATE_DESIGNS = [
  { value: "classicAcademic", label: "Classic Academic" },
  { value: "modernMinimal", label: "Modern Minimal" },
  { value: "premiumGold", label: "Premium Gold" },
  { value: "cleanBlue", label: "Clean Blue" },
  { value: "customUpload", label: "Custom Upload" },
  { value: "aiSuggested", label: "AI Suggested" },
];
const BULK_OPTIONAL_FIELDS = [
  "certificateTitle",
  "certificateSubtitle",
  "description",
  "gradeOrResult",
  "duration",
  "venue",
  "instructorName",
  "remarks",
];

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

function getBulkRowFromCells(cells, headerMap = null) {
  if (headerMap) {
    const getByHeader = (field) => cells[headerMap[field]] || "";

    return {
      studentName: getByHeader("studentname").trim(),
      studentEmail: getByHeader("studentemail").trim().toLowerCase(),
      courseName: getByHeader("coursename").trim(),
      issueDate: getByHeader("issuedate").trim(),
      certificateTitle: getByHeader("certificatetitle").trim(),
      certificateSubtitle: getByHeader("certificatesubtitle").trim(),
      description: getByHeader("description").trim(),
      gradeOrResult: getByHeader("gradeorresult").trim(),
      duration: getByHeader("duration").trim(),
      venue: getByHeader("venue").trim(),
      instructorName: getByHeader("instructorname").trim(),
      remarks: getByHeader("remarks").trim(),
    };
  }

  const [
    studentName = "",
    studentEmail = "",
    courseName = "",
    issueDate = "",
    ...optionalCells
  ] = cells;

  const row = {
    studentName: studentName.trim(),
    studentEmail: studentEmail.trim().toLowerCase(),
    courseName: courseName.trim(),
    issueDate: issueDate.trim(),
  };

  BULK_OPTIONAL_FIELDS.forEach((field, index) => {
    const value = optionalCells[index]?.trim();

    if (value) {
      row[field] = value;
    }
  });

  return row;
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
  const includesHeader = hasBulkHeader(firstCells);
  const headerMap = includesHeader
    ? firstCells.reduce((current, cell, index) => {
        current[normalizeHeader(cell)] = index;
        return current;
      }, {})
    : null;
  const dataLines = includesHeader ? lines.slice(1) : lines;

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
    const row = getBulkRowFromCells(cells, headerMap);

    if (!headerMap && cells.length < 4) {
      validationErrors.push(
        `Row ${rowNumber}: expected at least 4 comma-separated fields.`,
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

function getCertificateTrustStatus(certificate = {}) {
  if (certificate.status === "revoked") return "Revoked";
  if (certificate.issuanceMode === "bulk" && certificate.blockchainStatus === "confirmed") {
    return "Confirmed";
  }
  if (certificate.blockchainStatus === "confirmed") return "Confirmed";
  if (certificate.blockchainStatus === "failed") return "Failed";
  return "Pending";
}

function getCertificateFilterValue(certificate = {}) {
  if (certificate.status === "revoked") return "revoked";
  if (certificate.issuanceMode === "bulk") return "bulk";
  if (certificate.blockchainStatus === "confirmed") return "confirmed";
  if (certificate.issuanceMode === "single" || !certificate.issuanceMode) return "single";
  return "pending";
}

function certificateMatchesFilter(certificate, filterValue) {
  if (filterValue === "all") return true;
  if (filterValue === "confirmed") return certificate.blockchainStatus === "confirmed";
  if (filterValue === "pending") {
    return !certificate.blockchainStatus || certificate.blockchainStatus === "pending";
  }
  if (filterValue === "revoked") return certificate.status === "revoked";
  if (filterValue === "bulk") return certificate.issuanceMode === "bulk";
  if (filterValue === "single") return certificate.issuanceMode !== "bulk";
  return getCertificateFilterValue(certificate) === filterValue;
}

function createAiDesignSuggestion(prompt) {
  const normalizedPrompt = prompt.toLowerCase();
  const wantsGold =
    normalizedPrompt.includes("gold") ||
    normalizedPrompt.includes("premium") ||
    normalizedPrompt.includes("elegant") ||
    normalizedPrompt.includes("formal");
  const wantsBlue =
    normalizedPrompt.includes("blue") ||
    normalizedPrompt.includes("corporate") ||
    normalizedPrompt.includes("tech");
  const wantsMinimal =
    normalizedPrompt.includes("minimal") ||
    normalizedPrompt.includes("simple") ||
    normalizedPrompt.includes("clean");

  if (wantsGold) {
    return {
      themeName: "Premium Gold",
      palette: "ivory, charcoal, warm gold",
      borderStyle: normalizedPrompt.includes("ornate") ? "ornate" : "double line",
      typographyStyle: "classic serif",
      layoutStyle: "formal academic",
      design: "premiumGold",
      accent: "gold",
      tone: "academic",
    };
  }

  if (wantsBlue) {
    return {
      themeName: "Clean Blue",
      palette: "white, navy, bright blue",
      borderStyle: "structured blue frame",
      typographyStyle: "modern sans with serif name",
      layoutStyle: "balanced institutional",
      design: "cleanBlue",
      accent: "blue",
      tone: "professional",
    };
  }

  if (wantsMinimal) {
    return {
      themeName: "Modern Minimal",
      palette: "white, graphite, soft teal",
      borderStyle: "thin minimal rule",
      typographyStyle: "clean sans",
      layoutStyle: "spacious modern",
      design: "modernMinimal",
      accent: "teal",
      tone: "contemporary",
    };
  }

  return {
    themeName: "Classic Academic",
    palette: "white, navy, muted gold",
    borderStyle: "double academic border",
    typographyStyle: "traditional serif",
    layoutStyle: "centered ceremonial",
    design: "classicAcademic",
    accent: "navy",
    tone: "academic",
  };
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
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const normalizedSearchTerm = searchTerm.trim().toLowerCase();
  const filteredCertificates = useMemo(() => {
    return certificates.filter((certificate) => {
      const certificateId = getCertificateIdentifier(certificate);
      const statusText = [
        certificate.status,
        certificate.blockchainStatus,
        certificate.emailStatus,
        certificate.ipfsStatus,
        getCertificateTrustStatus(certificate),
        certificate.issuanceMode,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const searchTarget = [
        certificateId,
        certificate.studentName,
        certificate.studentEmail,
        certificate.courseName,
        statusText,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return (
        (!normalizedSearchTerm || searchTarget.includes(normalizedSearchTerm)) &&
        certificateMatchesFilter(certificate, statusFilter)
      );
    });
  }, [certificates, normalizedSearchTerm, statusFilter]);

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

      <div className="list-toolbar">
        <label className="field">
          <span>Search Certificates</span>
          <input
            className="input"
            placeholder="ID, student, email, course, or status"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </label>
        <label className="field">
          <span>Filter</span>
          <select
            className="input"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">All</option>
            <option value="confirmed">Confirmed</option>
            <option value="pending">Pending</option>
            <option value="revoked">Revoked</option>
            <option value="bulk">Bulk</option>
            <option value="single">Single</option>
          </select>
        </label>
      </div>

      {loading ? <div className="alert">Loading certificates...</div> : null}

      {!loading && certificates.length === 0 ? (
        <div className="empty-state">
          <strong>No certificates issued yet</strong>
          <span>Newly issued certificates will appear here.</span>
        </div>
      ) : null}

      {!loading && certificates.length > 0 && filteredCertificates.length === 0 ? (
        <div className="empty-state">
          <strong>No matching certificates</strong>
          <span>Try another search term or filter.</span>
        </div>
      ) : null}

      {!loading && filteredCertificates.length > 0 ? (
        <div className="table-container table-container-scroll">
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
              {filteredCertificates.map((certificate) => {
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

export default function OrgAdminDashboard({ user, view = "overview" }) {
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
  const [teacherSearchTerm, setTeacherSearchTerm] = useState("");
  const [teacherStatusFilter, setTeacherStatusFilter] = useState("all");
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

  const handleCertificateTemplateUpload = (file) => {
    if (!file) {
      updateCertificateForm("certificateTemplateDataUrl", "");
      return;
    }

    if (!file.type.startsWith("image/")) {
      toast.warning("Upload a PNG or JPG certificate template image.");
      return;
    }

    if (!["image/png", "image/jpeg"].includes(file.type)) {
      toast.warning("PDF templates support PNG and JPG images.");
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      const dataUrl = String(reader.result || "");

      if (dataUrl.length > MAX_TEMPLATE_DATA_URL_LENGTH) {
        toast.warning("Template image is too large. Use an image under about 650 KB.");
        updateCertificateForm("certificateTemplateDataUrl", "");
        return;
      }

      setCertificateForm((current) => ({
        ...current,
        certificateDesign: "customUpload",
        certificateTemplateDataUrl: dataUrl,
      }));
      toast.success("Template image added for this certificate.");
    };

    reader.onerror = () => {
      toast.error("Could not read the template image. Please try another file.");
    };

    reader.readAsDataURL(file);
  };

  const generateDesignSuggestion = () => {
    const prompt = certificateForm.aiDesignPrompt.trim();

    if (!prompt) {
      toast.warning("Enter an AI design prompt first.");
      return;
    }

    const suggestion = createAiDesignSuggestion(prompt);

    setCertificateForm((current) => ({
      ...current,
      certificateDesign: "aiSuggested",
      aiDesignSuggestion: suggestion,
    }));
    toast.success(`Design suggestion ready: ${suggestion.themeName}.`);
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
      const { generateCertificatePdf } = await import("../utils/certificatePdf");

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
        certificateTitle:
          certificateForm.certificateTitle.trim() ||
          emptyCertificateForm.certificateTitle,
        certificateSubtitle:
          certificateForm.certificateSubtitle.trim() ||
          emptyCertificateForm.certificateSubtitle,
        description: certificateForm.description.trim(),
        gradeOrResult: certificateForm.gradeOrResult.trim(),
        duration: certificateForm.duration.trim(),
        venue: certificateForm.venue.trim(),
        instructorName: certificateForm.instructorName.trim(),
        remarks: certificateForm.remarks.trim(),
        certificateDesign: certificateForm.certificateDesign,
        certificateTemplateDataUrl:
          certificateForm.certificateDesign === "customUpload"
            ? certificateForm.certificateTemplateDataUrl
            : "",
        aiDesignPrompt: certificateForm.aiDesignPrompt.trim(),
        aiDesignSuggestion: certificateForm.aiDesignSuggestion,
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
  const normalizedTeacherSearch = teacherSearchTerm.trim().toLowerCase();
  const filteredTeachers = useMemo(() => {
    return teachers.filter((teacher) => {
      const status = String(teacher.status || "unknown").toLowerCase();
      const searchTarget = [
        teacher.name,
        teacher.email,
        teacher.status,
        teacher.uid,
        teacher.id,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return (
        (!normalizedTeacherSearch ||
          searchTarget.includes(normalizedTeacherSearch)) &&
        (teacherStatusFilter === "all" || status === teacherStatusFilter)
      );
    });
  }, [normalizedTeacherSearch, teacherStatusFilter, teachers]);
  const recentCertificates = certificates.slice(0, 5);
  const activeTeacherCount = teachers.filter(
    (teacher) => String(teacher.status || "active").toLowerCase() === "active",
  ).length;
  const confirmedCertificateCount = certificates.filter(
    (certificate) => certificate.blockchainStatus === "confirmed",
  ).length;
  const pendingCertificateCount = certificates.filter(
    (certificate) =>
      !certificate.blockchainStatus ||
      certificate.blockchainStatus === "pending",
  ).length;
  const revokedCertificateCount = certificates.filter(
    (certificate) => certificate.status === "revoked",
  ).length;
  const showOverview = view === "overview";
  const showIssueForm = isTeacher && view === "issue";
  const showBulkIssueForm = isTeacher && view === "bulkIssue";
  const showCertificateList = isTeacher && view === "certificates";
  const showCreateTeacher = isOrgAdmin && view === "createTeacher";
  const showTeacherList = isOrgAdmin && view === "teachers";

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

  const navItems = isTeacher
    ? [
        { to: "/dashboard", label: "Overview", icon: "O" },
        { to: "/dashboard/issue", label: "Issue", icon: "I" },
        { to: "/dashboard/bulk-issue", label: "Bulk Issue", icon: "B" },
        { to: "/dashboard/certificates", label: "Certificates", icon: "C" },
      ]
    : [
        { to: "/org-admin", label: "Overview", icon: "O" },
        { to: "/org-admin/teachers", label: "Teachers", icon: "T" },
        { to: "/org-admin/create-teacher", label: "Create Teacher", icon: "C" },
      ];
  const pageTitle = isTeacher
    ? {
        overview: "Teacher Overview",
        issue: "Issue Certificate",
        bulkIssue: "Bulk Issue Certificates",
        certificates: "Issued Certificates",
      }[view] || "Teacher Dashboard"
    : {
        overview: "Org Admin Overview",
        teachers: "Teacher Directory",
        createTeacher: "Create Teacher",
      }[view] || "Org Admin Dashboard";

  return (
    <AppLayout
      user={user}
      role={profile?.role}
      title={pageTitle}
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
            {showOverview ? (
              <>
                <section className="quick-actions">
                  <Link to="/dashboard/issue" className="action-card">
                    <span className="badge badge-primary">Single</span>
                    <strong>Issue Single Certificate</strong>
                    <span>Create one polished certificate with display metadata.</span>
                  </Link>
                  <Link to="/dashboard/bulk-issue" className="action-card">
                    <span className="badge badge-primary">Batch</span>
                    <strong>Bulk Issue Certificates</strong>
                    <span>Paste CSV rows and create a Merkle-backed batch.</span>
                  </Link>
                  <Link to="/dashboard/certificates" className="action-card">
                    <span className="badge badge-primary">Records</span>
                    <strong>View Issued Certificates</strong>
                    <span>Search, share, download, revoke, and verify certificates.</span>
                  </Link>
                </section>

                <div className="grid grid-three">
                  <section className="card stat-card">
                    <span className="muted">Confirmed</span>
                    <strong className="stat-value">{confirmedCertificateCount}</strong>
                  </section>
                  <section className="card stat-card">
                    <span className="muted">Pending</span>
                    <strong className="stat-value">{pendingCertificateCount}</strong>
                  </section>
                  <section className="card stat-card">
                    <span className="muted">Revoked</span>
                    <strong className="stat-value">{revokedCertificateCount}</strong>
                  </section>
                </div>

                <section className="card">
                  <div className="section-header">
                    <div>
                      <h2>Recent Activity</h2>
                      <p className="muted">Latest certificates issued from this account.</p>
                    </div>
                    <Link to="/dashboard/certificates" className="button button-outline">
                      View All
                    </Link>
                  </div>

                  {certificatesLoading ? (
                    <div className="alert">Loading recent certificates...</div>
                  ) : null}

                  {!certificatesLoading && recentCertificates.length === 0 ? (
                    <div className="empty-state">
                      <strong>No recent certificates</strong>
                      <span>Issue a certificate to populate your demo activity.</span>
                    </div>
                  ) : null}

                  {!certificatesLoading && recentCertificates.length > 0 ? (
                    <div className="table-container table-container-compact">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Student</th>
                            <th>Course</th>
                            <th>Status</th>
                            <th>Open</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recentCertificates.map((certificate) => {
                            const certificateId = getCertificateIdentifier(certificate);

                            return (
                              <tr key={certificate.id}>
                                <td>
                                  <strong>{certificate.studentName || "-"}</strong>
                                  <p className="muted">{certificate.studentEmail || "-"}</p>
                                </td>
                                <td>{certificate.courseName || "-"}</td>
                                <td>
                                  <span
                                    className={getStatusBadge(
                                      certificate.blockchainStatus || "pending",
                                    )}
                                  >
                                    {getCertificateTrustStatus(certificate)}
                                  </span>
                                </td>
                                <td>
                                  <Link
                                    to={`/verify/${certificateId}`}
                                    className="button button-tonal button-small"
                                  >
                                    Verify
                                  </Link>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </section>
              </>
            ) : null}

            {showIssueForm ? (
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

                <label className="field">
                  <span>Certificate Title</span>
                  <input
                    className="input"
                    placeholder="Certificate of Achievement"
                    value={certificateForm.certificateTitle}
                    onChange={(event) =>
                      updateCertificateForm("certificateTitle", event.target.value)
                    }
                    disabled={issuingCertificate}
                  />
                </label>

                <label className="field">
                  <span>Certificate Subtitle</span>
                  <input
                    className="input"
                    placeholder="This is proudly presented to"
                    value={certificateForm.certificateSubtitle}
                    onChange={(event) =>
                      updateCertificateForm("certificateSubtitle", event.target.value)
                    }
                    disabled={issuingCertificate}
                  />
                </label>

                <label className="field full-width">
                  <span>Description</span>
                  <textarea
                    className="input textarea"
                    rows={3}
                    placeholder="For successfully completing the blockchain workshop"
                    value={certificateForm.description}
                    onChange={(event) =>
                      updateCertificateForm("description", event.target.value)
                    }
                    disabled={issuingCertificate}
                  />
                </label>

                <label className="field">
                  <span>Grade or Result</span>
                  <input
                    className="input"
                    placeholder="Distinction, Pass, A+, etc."
                    value={certificateForm.gradeOrResult}
                    onChange={(event) =>
                      updateCertificateForm("gradeOrResult", event.target.value)
                    }
                    disabled={issuingCertificate}
                  />
                </label>

                <label className="field">
                  <span>Duration</span>
                  <input
                    className="input"
                    placeholder="6 weeks, 24 hours, May 2026"
                    value={certificateForm.duration}
                    onChange={(event) =>
                      updateCertificateForm("duration", event.target.value)
                    }
                    disabled={issuingCertificate}
                  />
                </label>

                <label className="field">
                  <span>Venue</span>
                  <input
                    className="input"
                    placeholder="Main Auditorium"
                    value={certificateForm.venue}
                    onChange={(event) =>
                      updateCertificateForm("venue", event.target.value)
                    }
                    disabled={issuingCertificate}
                  />
                </label>

                <label className="field">
                  <span>Instructor Name</span>
                  <input
                    className="input"
                    placeholder="Instructor or coordinator"
                    value={certificateForm.instructorName}
                    onChange={(event) =>
                      updateCertificateForm("instructorName", event.target.value)
                    }
                    disabled={issuingCertificate}
                  />
                </label>

                <label className="field full-width">
                  <span>Remarks</span>
                  <textarea
                    className="input textarea"
                    rows={2}
                    placeholder="Optional remarks for the printed certificate"
                    value={certificateForm.remarks}
                    onChange={(event) =>
                      updateCertificateForm("remarks", event.target.value)
                    }
                    disabled={issuingCertificate}
                  />
                </label>

                <label className="field">
                  <span>Certificate Design</span>
                  <select
                    className="input"
                    value={certificateForm.certificateDesign}
                    onChange={(event) =>
                      updateCertificateForm("certificateDesign", event.target.value)
                    }
                    disabled={issuingCertificate}
                  >
                    {CERTIFICATE_DESIGNS.map((design) => (
                      <option key={design.value} value={design.value}>
                        {design.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Custom Template Image</span>
                  <input
                    className="input"
                    type="file"
                    accept="image/png,image/jpeg"
                    onChange={(event) =>
                      handleCertificateTemplateUpload(event.target.files?.[0])
                    }
                    disabled={issuingCertificate}
                  />
                </label>

                {certificateForm.certificateTemplateDataUrl ? (
                  <div className="template-preview full-width">
                    <span className="badge badge-primary">Custom template ready</span>
                    <button
                      type="button"
                      className="button button-outline button-small"
                      onClick={() =>
                        setCertificateForm((current) => ({
                          ...current,
                          certificateTemplateDataUrl: "",
                        }))
                      }
                    >
                      Remove Template
                    </button>
                  </div>
                ) : null}

                <label className="field full-width">
                  <span>AI Design Prompt</span>
                  <textarea
                    className="input textarea"
                    rows={2}
                    placeholder="formal university gold certificate with elegant border"
                    value={certificateForm.aiDesignPrompt}
                    onChange={(event) =>
                      updateCertificateForm("aiDesignPrompt", event.target.value)
                    }
                    disabled={issuingCertificate}
                  />
                </label>

                <div className="full-width button-row">
                  <button
                    type="button"
                    className="button button-outline"
                    onClick={generateDesignSuggestion}
                    disabled={issuingCertificate}
                  >
                    Generate Design Suggestion
                  </button>
                  {certificateForm.aiDesignSuggestion ? (
                    <span className="badge badge-primary">
                      {certificateForm.aiDesignSuggestion.themeName}
                    </span>
                  ) : null}
                </div>

                <button
                  type="submit"
                  disabled={issuingCertificate}
                  className="button full-width"
                >
                  {issuingCertificate ? "Issuing..." : "Issue Certificate"}
                </button>
              </form>
            </section>
            ) : null}

            {showBulkIssueForm ? (
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
                        <th>Details</th>
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
                          <td>
                            {row.certificateTitle ||
                            row.description ||
                            row.gradeOrResult ||
                            row.duration ||
                            row.venue ||
                            row.instructorName ||
                            row.remarks
                              ? "Custom"
                              : "Default"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </section>
            ) : null}

            {showCertificateList ? (
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
            ) : null}
          </>
        ) : null}

        {isOrgAdmin ? (
          <>
            {showOverview ? (
              <>
                <section className="quick-actions">
                  <Link to="/org-admin/create-teacher" className="action-card">
                    <span className="badge badge-primary">Invite</span>
                    <strong>Create Teacher</strong>
                    <span>Add a teacher account for certificate issuance.</span>
                  </Link>
                  <Link to="/org-admin/teachers" className="action-card">
                    <span className="badge badge-primary">Directory</span>
                    <strong>View Teachers</strong>
                    <span>Search teacher access and revoke when needed.</span>
                  </Link>
                </section>

                <div className="grid grid-three">
                  <section className="card stat-card">
                    <span className="muted">Active Teachers</span>
                    <strong className="stat-value">{activeTeacherCount}</strong>
                  </section>
                  <section className="card stat-card">
                    <span className="muted">Inactive Teachers</span>
                    <strong className="stat-value">
                      {Math.max(teachers.length - activeTeacherCount, 0)}
                    </strong>
                  </section>
                  <section className="card stat-card">
                    <span className="muted">Organization</span>
                    <strong className="hash-value">{organizationName || organizationId}</strong>
                  </section>
                </div>
              </>
            ) : null}

            {showCreateTeacher ? (
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
            ) : null}

            {showTeacherList ? (
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

              <div className="list-toolbar">
                <label className="field">
                  <span>Search Teachers</span>
                  <input
                    className="input"
                    placeholder="Name, email, or status"
                    value={teacherSearchTerm}
                    onChange={(event) => setTeacherSearchTerm(event.target.value)}
                  />
                </label>
                <label className="field">
                  <span>Filter</span>
                  <select
                    className="input"
                    value={teacherStatusFilter}
                    onChange={(event) => setTeacherStatusFilter(event.target.value)}
                  >
                    <option value="all">All</option>
                    <option value="active">Active</option>
                    <option value="disabled">Disabled</option>
                    <option value="revoked">Revoked</option>
                  </select>
                </label>
              </div>

              {!teachersLoading && teachers.length === 0 ? (
                <div className="empty-state">
                  <strong>No active teachers found</strong>
                  <span>Create a teacher account to start issuing certificates.</span>
                </div>
              ) : null}

              {!teachersLoading && teachers.length > 0 && filteredTeachers.length === 0 ? (
                <div className="empty-state">
                  <strong>No matching teachers</strong>
                  <span>Try another search term or filter.</span>
                </div>
              ) : null}

              {!teachersLoading && filteredTeachers.length > 0 ? (
                <div className="table-container table-container-scroll table-container-compact">
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
                      {filteredTeachers.map((teacher) => (
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
            ) : null}
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
