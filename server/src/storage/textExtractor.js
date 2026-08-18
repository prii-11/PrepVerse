// Resume text extraction — PDF/DOCX → plain text, M6 P2 (docs/17 §8 D1).
// The ONLY module that owns file-parsing dependencies (pdf-parse v2,
// mammoth); anything else in the codebase that needs plain resume text goes
// through here. Bytes-in / text-out, no persistence, no HTTP.
//
// Dependency note: pdf-parse is pinned to v2 (modern pdf.js). v1.x bundles a
// 2017-era pdf.js build that breaks at runtime once mongoose (the mongodb
// driver) is loaded in the same process — verified empirically during M6 P2.
//
// Errors: every failure (unreadable file, unsupported content, empty result)
// surfaces as ResumeTextExtractionError (RESUME_TEXT_EXTRACTION_FAILED, 400)
// — the same code resumeAnalyzer's pre-check uses (docs/07 §2), so the
// upload path treats "couldn't get text" uniformly, before any AI call.
const { PDFParse } = require('pdf-parse');
const mammoth = require('mammoth');
const { ResumeTextExtractionError } = require('../utils/errors');

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

async function extractText(buffer, mimeType) {
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
    throw new ResumeTextExtractionError('Resume text extraction failed — unreadable file');
  }
  if (!text || text.trim().length === 0) {
    // Matches the pre-check in resumeAnalyzer (docs/07 §2): empty/garbled
    // input never reaches Gemini.
    throw new ResumeTextExtractionError();
  }
  return text;
}

module.exports = { extractText, PDF_MIME, DOCX_MIME };