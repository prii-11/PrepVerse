import { describe, expect, it } from 'vitest';
import { MAX_RESUME_SIZE_BYTES, validateResumeFile } from './fileValidation';

function makeFile(name, size, type) {
  return new File([size > 0 ? new Uint8Array(size) : []], name, { type });
}

describe('validateResumeFile', () => {
  it('accepts a valid PDF', () => {
    expect(validateResumeFile(makeFile('resume.pdf', 1000, 'application/pdf'))).toEqual({ valid: true });
  });

  it('accepts a valid DOCX', () => {
    expect(
      validateResumeFile(makeFile('resume.docx', 1000, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
    ).toEqual({ valid: true });
  });

  it('accepts a file exactly at the 5MB boundary', () => {
    expect(
      validateResumeFile(makeFile('resume.pdf', MAX_RESUME_SIZE_BYTES, 'application/pdf')),
    ).toEqual({ valid: true });
  });

  it('rejects a file above 5MB with FILE_TOO_LARGE', () => {
    const result = validateResumeFile(makeFile('resume.pdf', MAX_RESUME_SIZE_BYTES + 1, 'application/pdf'));
    expect(result.valid).toBe(false);
    expect(result.code).toBe('FILE_TOO_LARGE');
  });

  it('rejects an unsupported extension', () => {
    const result = validateResumeFile(makeFile('resume.txt', 1000, 'text/plain'));
    expect(result.valid).toBe(false);
    expect(result.code).toBe('UNSUPPORTED_TYPE');
  });

  it('rejects a supported extension with an unexpected MIME type', () => {
    const result = validateResumeFile(makeFile('resume.pdf', 1000, 'text/plain'));
    expect(result.valid).toBe(false);
    expect(result.code).toBe('UNSUPPORTED_TYPE');
  });

  it('rejects an empty file', () => {
    const result = validateResumeFile(makeFile('resume.pdf', 0, 'application/pdf'));
    expect(result.valid).toBe(false);
    expect(result.code).toBe('EMPTY_FILE');
  });

  it('rejects a missing file', () => {
    const result = validateResumeFile(null);
    expect(result.valid).toBe(false);
    expect(result.code).toBe('NO_FILE');
  });
});