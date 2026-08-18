// File upload middleware (resume upload — M6 P2, docs/06 §3 + docs/17 §4.2).
// Replaces the M2.1 stub. Enforcement happens HERE, before a byte reaches
// object storage or the AI Orchestrator:
//   - multipart parse (memory storage, 1 file)
//   - size cap: 5MB (docs/06 §3, "max file size (e.g. 5MB)")
//   - MIME allowlist: PDF, DOCX only (docs/06 §3)
//   - magic-byte sniffing: the client-declared Content-Type is untrusted —
//     declared type must match what the file actually is (%PDF- / PK zip)
//   - filename sanitization: path separators/control chars stripped, length
//     capped, extension allowlisted (docs/06 §3 "filename sanitization
//     before it ever touches Supabase Storage")
//
// On success: req.file carries { buffer, sanitized originalFilename,
// canonical mimeType, size } for the resumes service. Everything else stays
// out — this middleware does no storage, no Mongo, no AI.
const multer = require('multer');
const { ValidationError } = require('../utils/errors');

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB — docs/06 §3
const MAX_FILENAME_LENGTH = 120;

// Canonical allowlist (docs/06 §3: PDF, DOCX only). The sniffed type maps to
// one canonical MIME so the Resume doc never stores a client-claimed variant
// (e.g. application/octet-stream or a spoofed one).
const CANONICAL_TYPES = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

const DECLARED_TO_CANONICAL = {
  'application/pdf': 'pdf',
  'application/x-pdf': 'pdf',
  'application/msword': 'docx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/zip': 'docx',
};

const ALLOWED_EXTENSIONS = { '.pdf': 'pdf', '.docx': 'docx' };

// Detect real file type from content, not from the client's declaration.
// PDFs start with %PDF- (allowing leading junk in the first 1KiB); DOCX is a
// ZIP container (PK\x03\x04) — false positives are mitigated by requiring the
// declared MIME to agree with the sniff result.
function sniffType(buffer) {
  const head = buffer.subarray(0, 1024);
  if (head.includes(Buffer.from('%PDF-'))) {
    return 'pdf';
  }
  if (buffer.length >= 4 && buffer.readUInt32LE(0) === 0x04034b50) {
    return 'docx';
  }
  return null;
}

function sanitizeFilename(original) {
  if (!original || typeof original !== 'string') {
    return 'resume';
  }
  // Strip directory components and control characters, collapse whitespace,
  // cap length. The basename's extension must match the sniffed type.
  let name = String(original)
    .replace(/[\\/]/g, ' ')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
  if (name.length === 0) {
    name = 'resume';
  }
  return name.slice(0, MAX_FILENAME_LENGTH);
}

const storage = multer.memoryStorage();
const uploader = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE_BYTES, files: 1 },
});

function uploadFile(req, res, next) {
  uploader.single('file')(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return next(
          new ValidationError('File too large — maximum 5MB', {
            field: 'file',
            code: 'FILE_TOO_LARGE',
            maxBytes: MAX_FILE_SIZE_BYTES,
          })
        );
      }
      if (err instanceof multer.MulterError) {
        return next(new ValidationError(`Upload failed: ${err.message}`));
      }
      return next(err);
    }

    if (!req.file || !req.file.buffer || req.file.buffer.length === 0) {
      return next(new ValidationError('A resume file is required', { field: 'file' }));
    }

    const declared = (req.file.mimetype || '').toLowerCase();
    const declaredKind = DECLARED_TO_CANONICAL[declared];
    if (!declaredKind) {
      return next(
        new ValidationError('Unsupported file type — PDF and DOCX only', { field: 'file' })
      );
    }

    const sniffedKind = sniffType(req.file.buffer);
    if (sniffedKind !== declaredKind) {
      return next(
        new ValidationError('File content does not match its declared type', { field: 'file' })
      );
    }

    const original = req.file.originalname || 'resume';
    const sanitized = sanitizeFilename(original);
    const ext = sanitized.slice(sanitized.lastIndexOf('.'));
    if (ext !== '.' + sniffedKind) {
      return next(
        new ValidationError(`File extension must be .${sniffedKind}`, { field: 'file' })
      );
    }

    // Everything checked; hand the file over with the canonical, sniffed
    // facts only.
    req.file.mimeType = CANONICAL_TYPES[sniffedKind];
    req.file.originalFilename = sanitized;
    req.file.size = req.file.buffer.length;
    delete req.file.encoding;
    next();
  });
}

module.exports = uploadFile;