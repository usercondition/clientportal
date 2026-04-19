const path = require("path");
const crypto = require("crypto");
const multer = require("multer");

/** @type {Set<string>} */
const ALLOWED_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
]);

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_FILES_PER_MESSAGE = 5;

function kindFromMime(mime) {
  return mime && String(mime).startsWith("image/") ? "image" : "file";
}

function extensionForMime(mime) {
  const m = String(mime || "").toLowerCase();
  if (m === "image/jpeg") return ".jpg";
  if (m === "image/png") return ".png";
  if (m === "image/gif") return ".gif";
  if (m === "image/webp") return ".webp";
  if (m === "application/pdf") return ".pdf";
  return "";
}

/**
 * @param {unknown} raw
 * @returns {object[]}
 */
function normalizeDbAttachments(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * @param {unknown} raw
 */
function attachmentCount(raw) {
  return normalizeDbAttachments(raw).length;
}

/**
 * @param {object[]} rows
 */
function toApiAttachments(rows) {
  const list = normalizeDbAttachments(rows);
  return list.map((a) => ({
    kind: a.kind || kindFromMime(a.mime),
    name: a.originalName || a.storedName || "file",
    mime: a.mime || "application/octet-stream",
    size: typeof a.size === "number" ? a.size : 0,
    url: `/uploads/chat/${encodeURIComponent(String(a.storedName || ""))}`,
  }));
}

function safeOriginalName(name) {
  const base = path.basename(String(name || "file")).replace(/[^\w.\- ()\[\]]+/g, "_");
  return base.slice(0, 180) || "file";
}

/**
 * @param {string} uploadsChatDir absolute path to uploads/chat
 */
function createUploadMiddleware(uploadsChatDir) {
  const storage = multer.diskStorage({
    destination(_req, _file, cb) {
      cb(null, uploadsChatDir);
    },
    filename(_req, file, cb) {
      const ext = extensionForMime(file.mimetype) || path.extname(file.originalname || "") || "";
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  });

  return multer({
    storage,
    limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES_PER_MESSAGE },
    fileFilter(_req, file, cb) {
      if (!ALLOWED_MIMES.has(file.mimetype)) {
        const e = new Error("Only images (JPEG, PNG, GIF, WebP) and PDF files are allowed.");
        return cb(e);
      }
      cb(null, true);
    },
  });
}

/**
 * Map multer saved files to DB JSON rows.
 * @param {import("multer").File[]} files
 */
function mapUploadedFilesToDb(files) {
  return (files || []).map((f) => ({
    storedName: f.filename,
    originalName: safeOriginalName(f.originalname),
    mime: f.mimetype,
    size: f.size,
    kind: kindFromMime(f.mimetype),
  }));
}

function snippetWithAttachments(bodyText, dbAttachments) {
  const t = String(bodyText || "").trim();
  const att = normalizeDbAttachments(dbAttachments);
  if (att.length === 0) return t;
  const names = att
    .map((a) => a.originalName || a.storedName)
    .slice(0, 4)
    .join(", ");
  const extra = att.length > 4 ? ` (+${att.length - 4} more)` : "";
  const block = `[${att.length} attachment${att.length === 1 ? "" : "s"}: ${names}${extra}]`;
  return t ? `${t}\n\n${block}` : block;
}

function inboxPreviewLine(body, attachmentsRaw) {
  const t = String(body == null ? "" : body).trim();
  const n = attachmentCount(attachmentsRaw);
  if (n === 0) return t;
  const bit = n === 1 ? "1 attachment" : `${n} attachments`;
  if (!t) return `[${bit}]`;
  return `${t} · ${bit}`;
}

module.exports = {
  ALLOWED_MIMES,
  MAX_FILE_BYTES,
  MAX_FILES_PER_MESSAGE,
  kindFromMime,
  normalizeDbAttachments,
  attachmentCount,
  toApiAttachments,
  createUploadMiddleware,
  mapUploadedFilesToDb,
  snippetWithAttachments,
  inboxPreviewLine,
};
