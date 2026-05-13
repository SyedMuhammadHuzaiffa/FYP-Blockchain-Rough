import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import QRCode from "qrcode";

const A4_LANDSCAPE = [841.89, 595.28];
const PAGE_WIDTH = A4_LANDSCAPE[0];
const PAGE_HEIGHT = A4_LANDSCAPE[1];
const MARGIN = 42;

const COLORS = {
  ink: rgb(0.09, 0.12, 0.2),
  muted: rgb(0.37, 0.41, 0.5),
  navy: rgb(0.08, 0.16, 0.33),
  blue: rgb(0.17, 0.35, 0.72),
  teal: rgb(0.05, 0.5, 0.48),
  gold: rgb(0.77, 0.56, 0.18),
  border: rgb(0.77, 0.82, 0.9),
  soft: rgb(0.95, 0.97, 1),
  white: rgb(1, 1, 1),
  danger: rgb(0.71, 0.12, 0.18),
  success: rgb(0.04, 0.43, 0.28),
};

function formatValue(value, fallback = "-") {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value?.toDate === "function") {
    return value.toDate().toLocaleDateString();
  }
  return String(value);
}

function getCertificateId(certificate = {}) {
  return certificate.certificateId || certificate.id || "";
}

function getVerifyUrl(certificate = {}, options = {}) {
  if (options.verificationUrl) return options.verificationUrl;

  const certificateId = getCertificateId(certificate);
  const origin =
    options.origin ||
    (typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "");

  if (!certificateId) return "";

  return origin ? `${origin}/verify/${certificateId}` : `/verify/${certificateId}`;
}

function getVerificationStatus(certificate = {}, options = {}) {
  if (options.isRevoked) return "Revoked";

  const firestoreStatus = String(certificate.status || "").toLowerCase();
  const revocationStatus = String(
    certificate.blockchainRevocationStatus || "",
  ).toLowerCase();

  if (firestoreStatus === "revoked" || revocationStatus === "confirmed") {
    return "Revoked";
  }

  const resultStatus = String(
    options.blockchainStatus || options.blockchainResult || "",
  ).toLowerCase();
  const blockchainStatus = String(certificate.blockchainStatus || "").toLowerCase();
  const status = resultStatus || blockchainStatus;

  if (status.includes("revoked")) {
    return "Revoked";
  }

  if (
    ["confirmed", "verified", "verified on blockchain"].includes(status) ||
    status.includes("batch root anchored") ||
    status.includes("batch verified")
  ) {
    return certificate.issuanceMode === "bulk"
      ? "Batch Verified with Merkle Proof"
      : "Blockchain Verified";
  }

  return "Verification Pending";
}

function getDesignKey(certificate = {}) {
  if (certificate.certificateDesign === "aiSuggested") {
    return certificate.aiDesignSuggestion?.design || "classicAcademic";
  }

  return certificate.certificateDesign || "classicAcademic";
}

function getDesignStyle(certificate = {}) {
  const aiAccent = String(certificate.aiDesignSuggestion?.accent || "").toLowerCase();
  const designKey = getDesignKey(certificate);

  if (designKey === "premiumGold" || aiAccent === "gold") {
    return {
      background: rgb(1, 0.985, 0.94),
      wash: rgb(0.99, 0.95, 0.82),
      primary: rgb(0.24, 0.19, 0.12),
      accent: COLORS.gold,
      secondary: rgb(0.58, 0.41, 0.12),
      border: COLORS.gold,
      nameColor: rgb(0.16, 0.12, 0.08),
    };
  }

  if (designKey === "cleanBlue" || aiAccent === "blue") {
    return {
      background: rgb(0.965, 0.985, 1),
      wash: rgb(0.88, 0.94, 1),
      primary: COLORS.navy,
      accent: COLORS.blue,
      secondary: rgb(0.12, 0.3, 0.58),
      border: rgb(0.39, 0.58, 0.9),
      nameColor: COLORS.ink,
    };
  }

  if (designKey === "modernMinimal" || aiAccent === "teal") {
    return {
      background: COLORS.white,
      wash: rgb(0.94, 0.98, 0.97),
      primary: COLORS.ink,
      accent: COLORS.teal,
      secondary: rgb(0.22, 0.36, 0.36),
      border: rgb(0.65, 0.76, 0.76),
      nameColor: COLORS.ink,
    };
  }

  return {
    background: COLORS.white,
    wash: COLORS.soft,
    primary: COLORS.navy,
    accent: COLORS.gold,
    secondary: COLORS.blue,
    border: COLORS.navy,
    nameColor: COLORS.ink,
  };
}

async function embedTemplateImage(pdfDoc, dataUrl) {
  if (!dataUrl) return null;

  const bytes = dataUrlToUint8Array(dataUrl);

  if (/^data:image\/png/i.test(dataUrl)) {
    return pdfDoc.embedPng(bytes);
  }

  if (/^data:image\/jpe?g/i.test(dataUrl)) {
    return pdfDoc.embedJpg(bytes);
  }

  return null;
}

function sanitizeFilePart(value) {
  return String(value || "certificate")
    .trim()
    .replace(/[^a-z0-9-_]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function dataUrlToUint8Array(dataUrl) {
  const base64 = dataUrl.split(",")[1] || "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function textWidth(font, text, size) {
  return font.widthOfTextAtSize(String(text), size);
}

function fitText(text, font, size, maxWidth) {
  const raw = formatValue(text);

  if (textWidth(font, raw, size) <= maxWidth) return raw;

  let fitted = raw;

  while (fitted.length > 1 && textWidth(font, `${fitted}...`, size) > maxWidth) {
    fitted = fitted.slice(0, -1);
  }

  return `${fitted}...`;
}

function wrapText(text, font, size, maxWidth) {
  const value = formatValue(text);
  const words = value.split(/\s+/).filter(Boolean);
  const lines = [];
  let currentLine = "";

  words.forEach((word) => {
    const candidate = currentLine ? `${currentLine} ${word}` : word;

    if (textWidth(font, candidate, size) <= maxWidth) {
      currentLine = candidate;
      return;
    }

    if (currentLine) lines.push(currentLine);

    if (textWidth(font, word, size) <= maxWidth) {
      currentLine = word;
      return;
    }

    let chunk = "";
    for (const character of word) {
      if (textWidth(font, `${chunk}${character}`, size) <= maxWidth) {
        chunk += character;
      } else {
        lines.push(chunk);
        chunk = character;
      }
    }
    currentLine = chunk;
  });

  if (currentLine) lines.push(currentLine);

  return lines.length ? lines : ["-"];
}

function drawCenteredText(page, text, options) {
  const { font, size, y, color, maxWidth = PAGE_WIDTH - MARGIN * 2 } = options;
  const lines = wrapText(text, font, size, maxWidth);
  const lineHeight = size + 6;
  const startY = y + ((lines.length - 1) * lineHeight) / 2;

  lines.forEach((line, index) => {
    const width = textWidth(font, line, size);
    page.drawText(line, {
      x: (PAGE_WIDTH - width) / 2,
      y: startY - index * lineHeight,
      size,
      font,
      color,
    });
  });

  return startY - lines.length * lineHeight;
}

function drawLabelValue(page, { label, value, x, y, width, fonts, colors = COLORS }) {
  page.drawText(label.toUpperCase(), {
    x,
    y,
    size: 7.5,
    font: fonts.bold,
    color: colors.muted || COLORS.muted,
  });

  const lines = wrapText(formatValue(value), fonts.regular, 8.5, width);
  lines.slice(0, 2).forEach((line, index) => {
    page.drawText(line, {
      x,
      y: y - 13 - index * 11,
      size: 8.5,
      font: fonts.regular,
      color: colors.ink || COLORS.ink,
    });
  });
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function generateCertificatePdf(certificate, options = {}) {
  const sourceCertificate = certificate || {};
  const certificateId = getCertificateId(sourceCertificate);
  const verificationUrl = getVerifyUrl(sourceCertificate, options);

  if (!certificateId) {
    throw new Error("Certificate ID is required to generate the PDF.");
  }

  if (!verificationUrl) {
    throw new Error("Verification URL is required to generate the PDF.");
  }

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage(A4_LANDSCAPE);
  const fonts = {
    regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
    bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
    serif: await pdfDoc.embedFont(StandardFonts.TimesRoman),
    serifBold: await pdfDoc.embedFont(StandardFonts.TimesRomanBold),
    italic: await pdfDoc.embedFont(StandardFonts.TimesRomanItalic),
  };

  const qrDataUrl = await QRCode.toDataURL(verificationUrl, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 340,
  });
  const qrImage = await pdfDoc.embedPng(dataUrlToUint8Array(qrDataUrl));

  const organizationName =
    options.organizationName ||
    sourceCertificate.organizationName ||
    sourceCertificate.orgName ||
    sourceCertificate.organizationId ||
    "Unknown Organization";
  const certificateTitle =
    options.title ||
    sourceCertificate.certificateTitle ||
    sourceCertificate.title ||
    "Certificate of Achievement";
  const certificateSubtitle =
    sourceCertificate.certificateSubtitle || "This is proudly presented to";
  const studentName = sourceCertificate.studentName || "Student Name";
  const courseName = sourceCertificate.courseName || "Course / Event";
  const description = sourceCertificate.description || "For successfully completing";
  const gradeOrResult = sourceCertificate.gradeOrResult || "";
  const duration = sourceCertificate.duration || "";
  const venue = sourceCertificate.venue || "";
  const instructorName = sourceCertificate.instructorName || "";
  const remarks = sourceCertificate.remarks || "";
  const issueDate = formatValue(sourceCertificate.issueDate);
  const issuedByEmail = formatValue(sourceCertificate.issuedByEmail);
  const verificationStatus = getVerificationStatus(sourceCertificate, options);
  const designStyle = getDesignStyle(sourceCertificate);
  const fileName =
    options.fileName ||
    `${sanitizeFilePart(studentName)}-${sanitizeFilePart(certificateId)}.pdf`;
  let templateImage = null;

  try {
    templateImage = await embedTemplateImage(
      pdfDoc,
      sourceCertificate.certificateTemplateDataUrl,
    );
  } catch (error) {
    console.warn("Certificate template image could not be embedded:", error);
  }

  page.drawRectangle({
    x: 0,
    y: 0,
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
    color: designStyle.background,
  });

  if (templateImage) {
    page.drawImage(templateImage, {
      x: 0,
      y: 0,
      width: PAGE_WIDTH,
      height: PAGE_HEIGHT,
      opacity: 0.9,
    });
    page.drawRectangle({
      x: 0,
      y: 0,
      width: PAGE_WIDTH,
      height: PAGE_HEIGHT,
      color: COLORS.white,
      opacity: 0.12,
    });
  }

  page.drawRectangle({
    x: 18,
    y: 18,
    width: PAGE_WIDTH - 36,
    height: PAGE_HEIGHT - 36,
    borderColor: designStyle.border,
    borderWidth: 2.4,
  });
  page.drawRectangle({
    x: 28,
    y: 28,
    width: PAGE_WIDTH - 56,
    height: PAGE_HEIGHT - 56,
    borderColor: designStyle.accent,
    borderWidth: 0.9,
  });
  page.drawRectangle({
    x: 42,
    y: 42,
    width: PAGE_WIDTH - 84,
    height: PAGE_HEIGHT - 84,
    color: designStyle.wash,
    opacity: templateImage ? 0.62 : 0.78,
  });

  page.drawRectangle({
    x: 58,
    y: PAGE_HEIGHT - 100,
    width: PAGE_WIDTH - 116,
    height: 38,
    color: designStyle.primary,
    opacity: 0.95,
  });
  page.drawText(fitText(organizationName, fonts.bold, 15, 560), {
    x: 76,
    y: PAGE_HEIGHT - 85,
    size: 15,
    font: fonts.bold,
    color: COLORS.white,
  });
  page.drawText("Official Digital Certificate", {
    x: 76,
    y: PAGE_HEIGHT - 98,
    size: 8.5,
    font: fonts.regular,
    color: rgb(0.82, 0.88, 0.98),
  });

  const statusColor = /revoked/i.test(verificationStatus)
    ? COLORS.danger
    : /pending/i.test(verificationStatus)
      ? COLORS.gold
      : COLORS.success;
  const statusText = fitText(verificationStatus, fonts.bold, 9, 210);
  const statusWidth = textWidth(fonts.bold, statusText, 9) + 20;
  page.drawRectangle({
    x: PAGE_WIDTH - 76 - statusWidth,
    y: PAGE_HEIGHT - 90,
    width: statusWidth,
    height: 20,
    color: statusColor,
    opacity: 0.95,
  });
  page.drawText(statusText, {
    x: PAGE_WIDTH - 66 - statusWidth,
    y: PAGE_HEIGHT - 84,
    size: 9,
    font: fonts.bold,
    color: COLORS.white,
  });

  drawCenteredText(page, certificateTitle, {
    y: 432,
    size: 31,
    font: fonts.serifBold,
    color: designStyle.primary,
    maxWidth: 650,
  });

  page.drawText(certificateSubtitle, {
    x: (PAGE_WIDTH - textWidth(fonts.italic, certificateSubtitle, 13)) / 2,
    y: 378,
    size: 13,
    font: fonts.italic,
    color: COLORS.muted,
  });

  drawCenteredText(page, studentName, {
    y: 333,
    size: 34,
    font: fonts.serifBold,
    color: designStyle.nameColor,
    maxWidth: 625,
  });

  page.drawLine({
    start: { x: 188, y: 318 },
    end: { x: 653, y: 318 },
    thickness: 1.2,
    color: designStyle.accent,
  });

  drawCenteredText(page, description, {
    y: 284,
    size: 12.5,
    font: fonts.regular,
    color: COLORS.muted,
    maxWidth: 610,
  });

  drawCenteredText(page, courseName, {
    y: 246,
    size: 22,
    font: fonts.bold,
    color: designStyle.secondary,
    maxWidth: 610,
  });

  const details = [
    ["Certificate ID", certificateId],
    ["Issue Date", issueDate],
    ["Issued By", issuedByEmail],
    gradeOrResult ? ["Grade / Result", gradeOrResult] : null,
    duration ? ["Duration", duration] : null,
    venue ? ["Venue", venue] : null,
    instructorName ? ["Instructor", instructorName] : null,
  ].filter(Boolean);
  const detailColumnWidth = 248;
  const detailStartX = MARGIN + 30;
  const detailStartY = 190;

  details.slice(0, 6).forEach(([label, value], index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);

    drawLabelValue(page, {
      label,
      value,
      x: detailStartX + column * 280,
      y: detailStartY - row * 42,
      width: detailColumnWidth,
      fonts,
      colors: {
        muted: designStyle.secondary,
        ink: COLORS.ink,
      },
    });
  });

  if (remarks) {
    drawCenteredText(page, remarks, {
      y: 218,
      size: 9.5,
      font: fonts.italic,
      color: COLORS.muted,
      maxWidth: 600,
    });
  }

  if (/revoked/i.test(verificationStatus)) {
    page.drawText("REVOKED", {
      x: 330,
      y: 292,
      size: 42,
      font: fonts.bold,
      color: COLORS.danger,
      opacity: 0.16,
    });
  }

  const qrBoxX = PAGE_WIDTH - MARGIN - 122;
  const qrBoxY = 72;
  page.drawRectangle({
    x: qrBoxX,
    y: qrBoxY,
    width: 108,
    height: 108,
    color: COLORS.white,
    borderColor: designStyle.border,
    borderWidth: 0.9,
  });
  page.drawImage(qrImage, {
    x: qrBoxX + 8,
    y: qrBoxY + 8,
    width: 92,
    height: 92,
  });
  page.drawText("Scan to verify", {
    x: qrBoxX + 18,
    y: qrBoxY - 14,
    size: 8,
    font: fonts.bold,
    color: designStyle.primary,
  });

  page.drawRectangle({
    x: MARGIN,
    y: 38,
    width: PAGE_WIDTH - MARGIN * 2 - 146,
    height: 56,
    color: COLORS.white,
    opacity: 0.72,
    borderColor: designStyle.border,
    borderWidth: 0.8,
  });
  page.drawText("Verification Link", {
    x: MARGIN + 16,
    y: 74,
    size: 10,
    font: fonts.bold,
    color: designStyle.primary,
  });
  page.drawText(fitText(verificationUrl, fonts.regular, 8.5, 520), {
    x: MARGIN + 16,
    y: 59,
    size: 8.5,
    font: fonts.regular,
    color: COLORS.ink,
  });
  page.drawText(
    "This certificate can be verified online using the QR code or verification link.",
    {
      x: MARGIN + 16,
      y: 35,
      size: 8,
      font: fonts.italic,
      color: COLORS.muted,
    },
  );

  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes], { type: "application/pdf" });

  if (options.download !== false) {
    downloadBlob(blob, fileName);
  }

  return {
    blob,
    fileName,
    verificationUrl,
  };
}
