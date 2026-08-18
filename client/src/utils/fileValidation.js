// Client-side resume file pre-check (docs/06 §3). UX convenience only — the
// backend is authoritative and re-validates MIME, magic bytes, extension,
// and size on every upload. Codes mirror the backend error detail codes so
// the UI can reuse the same messaging vocabulary.
export const MAX_RESUME_SIZE_BYTES = 5 * 1024 * 1024; // 5MB — docs/06 §3

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.docx']);
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

function getExtension(name) {
  const index = (name || '').lastIndexOf('.');
  return index >= 0 ? name.slice(index).toLowerCase() : '';
}

// Returns { valid: true } or { valid: false, code, message }.
export function validateResumeFile(file) {
  if (!file || !file.name) {
    return { valid: false, code: 'NO_FILE', message: 'Choose a PDF or DOCX file' };
  }

  const extension = getExtension(file.name);
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return {
      valid: false,
      code: 'UNSUPPORTED_TYPE',
      message: 'Unsupported file type — PDF and DOCX only',
    };
  }

  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return {
      valid: false,
      code: 'UNSUPPORTED_TYPE',
      message: 'Unsupported file type — PDF and DOCX only',
    };
  }

  if (file.size === 0) {
    return { valid: false, code: 'EMPTY_FILE', message: 'The selected file is empty' };
  }

  if (file.size > MAX_RESUME_SIZE_BYTES) {
    return {
      valid: false,
      code: 'FILE_TOO_LARGE',
      message: 'File too large — maximum 5MB',
    };
  }

  return { valid: true };
}