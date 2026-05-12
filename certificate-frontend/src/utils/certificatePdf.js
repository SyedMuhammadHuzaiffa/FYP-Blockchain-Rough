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

function firstPresent(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
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

function getBlockchainStatus(certificate = {}, options = {}) {
  if (options.isRevoked) return "REVOKED ON BLOCKCHAIN";
  if (options.blockchainStatus) return options.blockchainStatus;
  if (options.blockchainResult) return options.blockchainResult;

  const firestoreStatus = String(certificate.status || "").toLowerCase();
  const revocationStatus = String(
    certificate.blockchainRevocationStatus || "",
  ).toLowerCase();

  if (firestoreStatus === "revoked" || revocationStatus === "confirmed") {
    return "REVOKED ON BLOCKCHAIN";
  }

  const blockchainStatus = String(certificate.blockchainStatus || "").toLowerCase();

  if (["confirmed", "verified"].includes(blockchainStatus)) {
    return "VERIFIED ON BLOCKCHAIN";
  }

  if (["failed", "error"].includes(blockchainStatus)) {
    return "BLOCKCHAIN CHECK FAILED";
  }

  return certificate.blockchainStatus || "PENDING BLOCKCHAIN";
}

function getProofHash(certificate = {}, options = {}) {
  return firstPresent(
    options.certificateHash,
    options.computedHash,
    options.onChain?.certificateHash,
    certificate.certificateHash,
    "Not available",
  );
}

function getTransactionHash(certificate = {}) {
  return firstPresent(
    certificate.blockchainTxHash,
    certificate.revokeTxHash,
    certificate.txHash,
    certificate.transactionHash,
    "Not available",
  );
}

function getIpfsCid(certificate = {}, options = {}) {
  return firstPresent(
    certificate.ipfsCid,
    certificate.ipfsCID,
    certificate.ipfsHash,
    options.onChain?.ipfsCid,
    "Not available",
  );
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

function drawLabelValue(page, { label, value, x, y, width, fonts }) {
  page.drawText(label.toUpperCase(), {
    x,
    y,
    size: 7.5,
    font: fonts.bold,
    color: COLORS.muted,
  });

  const lines = wrapText(formatValue(value), fonts.regular, 8.5, width);
  lines.slice(0, 2).forEach((line, index) => {
    page.drawText(line, {
      x,
      y: y - 13 - index * 11,
      size: 8.5,
      font: fonts.regular,
      color: COLORS.ink,
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
    options.title || sourceCertificate.title || "Certificate of Achievement";
  const studentName = sourceCertificate.studentName || "Student Name";
  const courseName = sourceCertificate.courseName || "Course / Event";
  const issueDate = formatValue(sourceCertificate.issueDate);
  const issuedByEmail = formatValue(sourceCertificate.issuedByEmail);
  const blockchainStatus = getBlockchainStatus(sourceCertificate, options);
  const proofHash = getProofHash(sourceCertificate, options);
  const transactionHash = getTransactionHash(sourceCertificate);
  const ipfsCid = getIpfsCid(sourceCertificate, options);
  const fileName =
    options.fileName ||
    `${sanitizeFilePart(studentName)}-${sanitizeFilePart(certificateId)}.pdf`;

  page.drawRectangle({
    x: 0,
    y: 0,
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
    color: COLORS.white,
  });
  page.drawRectangle({
    x: 18,
    y: 18,
    width: PAGE_WIDTH - 36,
    height: PAGE_HEIGHT - 36,
    borderColor: COLORS.navy,
    borderWidth: 2.2,
  });
  page.drawRectangle({
    x: 28,
    y: 28,
    width: PAGE_WIDTH - 56,
    height: PAGE_HEIGHT - 56,
    borderColor: COLORS.gold,
    borderWidth: 0.8,
  });
  page.drawRectangle({
    x: 42,
    y: 42,
    width: PAGE_WIDTH - 84,
    height: PAGE_HEIGHT - 84,
    color: COLORS.soft,
    opacity: 0.55,
  });

  page.drawRectangle({
    x: 42,
    y: PAGE_HEIGHT - 104,
    width: PAGE_WIDTH - 84,
    height: 42,
    color: COLORS.navy,
  });
  page.drawText(fitText(organizationName, fonts.bold, 15, 560), {
    x: 62,
    y: PAGE_HEIGHT - 88,
    size: 15,
    font: fonts.bold,
    color: COLORS.white,
  });
  page.drawText("Blockchain Certificate Verification System", {
    x: 62,
    y: PAGE_HEIGHT - 101,
    size: 8.5,
    font: fonts.regular,
    color: rgb(0.82, 0.88, 0.98),
  });

  const statusColor = /revoked|failed|mismatch/i.test(blockchainStatus)
    ? COLORS.danger
    : /pending|checking|unknown/i.test(blockchainStatus)
      ? COLORS.gold
      : COLORS.success;
  const statusText = fitText(blockchainStatus, fonts.bold, 9, 190);
  const statusWidth = textWidth(fonts.bold, statusText, 9) + 20;
  page.drawRectangle({
    x: PAGE_WIDTH - MARGIN - statusWidth,
    y: PAGE_HEIGHT - 92,
    width: statusWidth,
    height: 20,
    color: statusColor,
    opacity: 0.95,
  });
  page.drawText(statusText, {
    x: PAGE_WIDTH - MARGIN - statusWidth + 10,
    y: PAGE_HEIGHT - 86,
    size: 9,
    font: fonts.bold,
    color: COLORS.white,
  });

  drawCenteredText(page, certificateTitle, {
    y: 434,
    size: 30,
    font: fonts.serifBold,
    color: COLORS.navy,
    maxWidth: 610,
  });

  page.drawText("This is to certify that", {
    x: (PAGE_WIDTH - textWidth(fonts.italic, "This is to certify that", 13)) / 2,
    y: 380,
    size: 13,
    font: fonts.italic,
    color: COLORS.muted,
  });

  drawCenteredText(page, studentName, {
    y: 333,
    size: 34,
    font: fonts.serifBold,
    color: COLORS.ink,
    maxWidth: 625,
  });

  page.drawLine({
    start: { x: 188, y: 318 },
    end: { x: 653, y: 318 },
    thickness: 1.2,
    color: COLORS.gold,
  });

  drawCenteredText(page, "has successfully completed", {
    y: 284,
    size: 12.5,
    font: fonts.regular,
    color: COLORS.muted,
    maxWidth: 560,
  });

  drawCenteredText(page, courseName, {
    y: 246,
    size: 22,
    font: fonts.bold,
    color: COLORS.blue,
    maxWidth: 610,
  });

  page.drawText(`Issued on ${issueDate}`, {
    x: (PAGE_WIDTH - textWidth(fonts.regular, `Issued on ${issueDate}`, 11)) / 2,
    y: 211,
    size: 11,
    font: fonts.regular,
    color: COLORS.ink,
  });

  if (/revoked/i.test(blockchainStatus)) {
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
  const qrBoxY = 178;
  page.drawRectangle({
    x: qrBoxX,
    y: qrBoxY,
    width: 108,
    height: 108,
    color: COLORS.white,
    borderColor: COLORS.border,
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
    color: COLORS.navy,
  });

  page.drawRectangle({
    x: MARGIN,
    y: 38,
    width: PAGE_WIDTH - MARGIN * 2,
    height: 122,
    color: COLORS.white,
    borderColor: COLORS.border,
    borderWidth: 0.8,
  });
  page.drawText("Blockchain Proof", {
    x: MARGIN + 16,
    y: 140,
    size: 12,
    font: fonts.bold,
    color: COLORS.navy,
  });
  page.drawRectangle({
    x: MARGIN + 16,
    y: 130,
    width: 92,
    height: 2,
    color: COLORS.teal,
  });

  const firstColumn = MARGIN + 16;
  const secondColumn = MARGIN + 290;
  const thirdColumn = MARGIN + 542;

  drawLabelValue(page, {
    label: "Certificate ID",
    value: certificateId,
    x: firstColumn,
    y: 112,
    width: 240,
    fonts,
  });
  drawLabelValue(page, {
    label: "Issued By Email",
    value: issuedByEmail,
    x: firstColumn,
    y: 72,
    width: 240,
    fonts,
  });
  drawLabelValue(page, {
    label: "Verification URL",
    value: verificationUrl,
    x: secondColumn,
    y: 112,
    width: 224,
    fonts,
  });
  drawLabelValue(page, {
    label: "Blockchain Status",
    value: blockchainStatus,
    x: secondColumn,
    y: 72,
    width: 224,
    fonts,
  });
  drawLabelValue(page, {
    label: "Certificate Hash",
    value: proofHash,
    x: thirdColumn,
    y: 112,
    width: 178,
    fonts,
  });
  drawLabelValue(page, {
    label: "Transaction Hash",
    value: transactionHash,
    x: thirdColumn,
    y: 82,
    width: 178,
    fonts,
  });
  drawLabelValue(page, {
    label: "IPFS CID",
    value: ipfsCid,
    x: thirdColumn,
    y: 52,
    width: 178,
    fonts,
  });

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
