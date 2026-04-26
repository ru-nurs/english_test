const fs = require("fs");
const path = require("path");

const ALLOWED_EXTENSIONS = new Set([".mp3", ".wav", ".ogg", ".webm", ".m4a"]);
const ALLOWED_MIME_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/ogg",
  "application/ogg",
  "audio/webm",
  "video/webm",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
]);

const MAGIC_READ_BYTES = 64 * 1024;

function hasPrefix(buffer, prefix, offset = 0) {
  if (!Buffer.isBuffer(buffer) || buffer.length < offset + prefix.length) {
    return false;
  }

  for (let index = 0; index < prefix.length; index += 1) {
    if (buffer[offset + index] !== prefix[index]) {
      return false;
    }
  }

  return true;
}

function detectByMagic(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) {
    return "";
  }

  if (hasPrefix(buffer, Buffer.from("ID3"))) {
    return ".mp3";
  }

  if (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) {
    return ".mp3";
  }

  if (hasPrefix(buffer, Buffer.from("RIFF"), 0) && hasPrefix(buffer, Buffer.from("WAVE"), 8)) {
    return ".wav";
  }

  if (hasPrefix(buffer, Buffer.from("OggS"), 0)) {
    return ".ogg";
  }

  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
    return ".webm";
  }

  if (hasPrefix(buffer, Buffer.from("ftyp"), 4)) {
    return ".m4a";
  }

  return "";
}

function extFromMime(mimeType) {
  const value = String(mimeType || "").toLowerCase();
  if (!value) {
    return "";
  }

  if (value.includes("mpeg") || value.includes("mp3")) {
    return ".mp3";
  }
  if (value.includes("wav")) {
    return ".wav";
  }
  if (value.includes("ogg")) {
    return ".ogg";
  }
  if (value.includes("webm")) {
    return ".webm";
  }
  if (value.includes("mp4") || value.includes("m4a") || value.includes("aac")) {
    return ".m4a";
  }

  return "";
}

async function readMagicBytes(file) {
  if (Buffer.isBuffer(file?.buffer)) {
    return file.buffer.subarray(0, MAGIC_READ_BYTES);
  }

  if (file?.path) {
    const fd = await fs.promises.open(file.path, "r");
    try {
      const buffer = Buffer.alloc(MAGIC_READ_BYTES);
      const { bytesRead } = await fd.read(buffer, 0, MAGIC_READ_BYTES, 0);
      return buffer.subarray(0, bytesRead);
    } finally {
      await fd.close();
    }
  }

  return Buffer.alloc(0);
}

async function resolveFileSize(file) {
  if (Number.isFinite(Number(file?.size))) {
    return Number(file.size);
  }
  if (file?.path) {
    const stats = await fs.promises.stat(file.path);
    return Number(stats.size || 0);
  }
  return 0;
}

async function validateAudioUpload(file, { maxBytes }) {
  if (!file) {
    throw new Error("Audio file is required");
  }

  const sizeBytes = await resolveFileSize(file);
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    throw new Error("Audio file is empty");
  }
  if (sizeBytes > maxBytes) {
    throw new Error(`Audio file is too large. Max ${Math.round(maxBytes / (1024 * 1024))}MB`);
  }

  const magicBuffer = await readMagicBytes(file);
  if (!magicBuffer.length) {
    throw new Error("Audio file is empty");
  }

  const providedExt = path.extname(file.originalname || "").toLowerCase();
  const mimeType = String(file.mimetype || "").toLowerCase();
  const magicExt = detectByMagic(magicBuffer);
  const mimeExt = extFromMime(mimeType);
  const resolvedExt = magicExt || mimeExt || providedExt;

  if (!resolvedExt || !ALLOWED_EXTENSIONS.has(resolvedExt)) {
    throw new Error("Unsupported audio format. Allowed: mp3, wav, ogg, webm, m4a");
  }

  if (providedExt && !ALLOWED_EXTENSIONS.has(providedExt)) {
    throw new Error("Invalid file extension");
  }

  if (mimeType && !ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error("Invalid mime type for audio file");
  }

  if (magicExt && providedExt && magicExt !== providedExt) {
    throw new Error("File extension does not match file content");
  }

  return {
    extension: resolvedExt,
    mimeType,
    sizeBytes,
  };
}

module.exports = {
  validateAudioUpload,
};
