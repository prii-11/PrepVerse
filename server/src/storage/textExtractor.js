// Resume text extraction — PDF/DOCX → plain text, M6 P2 (docs/17 §8 D1).
// The ONLY module that owns file-parsing dependencies (pdf-parse v2,
// mammoth); anything else in the codebase that needs plain resume text goes
// through here. Bytes-in / text-out, no persistence.
//
// M6.1 (docs/21): OPTIONAL Azure Document Intelligence fallback. When
// DI_CONFIG.enabled and a storageKey is supplied, a local extraction that
// produced EMPTY text (the scanned/image-only PDF case — local OCR has
// nothing to give) is retried through azure.di.extractor. This is the ONLY
// trigger: parser exceptions (corrupt/unreadable input) fail immediately and
// are never sent to Azure (docs/21 §6). All HTTP lives in the azure client
// submodule; this file's own "no HTTP" property is preserved by delegating.
//
// Dependency note: pdf-parse is pinned to v2 (modern pdf.js). v1.x bundles a
// 2017-era pdf.js build that breaks at runtime once mongoose (the mongodb
// driver) is loaded in the same process — verified empirically during M6 P2.
//
// Errors: every failure (unreadable file, unsupported content, empty result)
// surfaces as ResumeTextExtractionError (RESUME_TEXT_EXTRACTION_FAILED, 400)
// — the same code resumeAnalyzer's pre-check uses (docs/07 §2), so the
// upload path treats "couldn't get text" uniformly, before any AI call.
// AzureDiError is an internal category; no new public taxonomy (docs/21 §7).
const { PDFParse } = require('pdf-parse');
const mammoth = require('mammoth');
const { ResumeTextExtractionError } = require('../utils/errors');
const storageClient = require('./storage.client');
const azureDi = require('./azure.di.extractor');
const { DI_CONFIG } = require('../config/di');

const PDF_MIME = 'application/pdf';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// pdf-parse v2 appends a per-page footer line ("-- 1 of 1 --") to the text;
// it's parse noise for resume analysis, strip it.
function stripPageFooters(text) {
  return text
    .split('\n')
    .filter((line) => !/^\s*--\s*\d+\s+of\s+\d+\s*--\s*$/.test(line))
    .join('\n');
}

async function extractPdf(buffer) {
  const parser = new PDFParse({ data: buffer });
  const { text } = await parser.getText();
  const cleaned = text ? stripPageFooters(text) : '';
  return cleaned.trim();
}

async function extractDocx(buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return result && typeof result.value === 'string' ? result.value : '';
}

async function extractText(buffer, mimeType, options = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new ResumeTextExtractionError();
  }
  let text;
  try {
    if (mimeType === PDF_MIME) {
      text = await extractPdf(buffer);
    } else if (mimeType === DOCX_MIME) {
      text = await extractDocx(buffer);
    } else {
      // Reachable only if the upload middleware's allowlist ever diverges —
      // the client never gets here for a non-allowlisted type.
      throw new ResumeTextExtractionError('Unsupported resume file type');
    }
  } catch (err) {
    if (err instanceof ResumeTextExtractionError) {
      throw err;
    }
    // Parser exception = unreadable/corrupt input (an input/document
    // failure). It is NOT an eligible azure fallback trigger (docs/21 §6):
    // the same corrupt bytes would be rejected by Document Intelligence too.
    throw new ResumeTextExtractionError('Resume text extraction failed — unreadable file');
  }
  if (!text || text.trim().length === 0) {
    // Empty local result (scanned/image-only PDF — pdf-parse yields nothing
    // for image pages). M6.1: this is the ONE eligible azure fallback case,
    // and only when explicitly enabled AND the caller supplied the storage
    // key for a signed URL. Every azure-side failure (auth, quota, timeout,
    // service down, empty OCR) funnels back into the unchanged FAILED
    // semantics — no new public error taxonomy (docs/21 §7).
    if (DI_CONFIG.enabled && typeof options.storageKey === 'string') {
      try {
        const signedUrl = await storageClient.signedUrl(options.storageKey);
        const azureText = await azureDi.extractDocument(signedUrl);
        if (azureText && azureText.trim().length > 0) {
          return azureText.trim();
        }
        throw new azureDi.AzureDiError('EMPTY_RESULT', 'Document Intelligence returned no readable text');
      } catch (fallbackErr) {
        // Structured, content-free log line (docs/21 §11): diagnosis without
        // exposing resume contents or the Azure key.
        console.warn(`[di] azure fallback failed (${fallbackErr?.category ?? 'UNKNOWN'}, status ${fallbackErr?.upstreamStatus ?? 'n/a'}): falling back to extraction failure`);
        throw new ResumeTextExtractionError();
      }
    }
    // Matches the pre-check in resumeAnalyzer (docs/07 §2): empty/garbled
    // input never reaches Gemini.
    throw new ResumeTextExtractionError();
  }
  return text;
}

module.exports = { extractText, PDF_MIME, DOCX_MIME };