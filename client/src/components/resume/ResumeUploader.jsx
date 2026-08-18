// Resume uploader — real file intake: client pre-check, synchronous
// multipart upload, and the backend's terminal result (ANALYZED or FAILED).
// The backend remains authoritative for validation; this component only
// pre-checks to avoid pointless requests. States: idle, invalid, uploading,
// success (ANALYZED), failure (FAILED or API error).
import { useRef, useState } from 'react';
import Button from '../common/Button';
import Loader from '../common/Loader';
import ResumeDetail from '../../pages/resumes/ResumeDetail';
import { resumeService } from '../../services/resumeService';
import { validateResumeFile } from '../../utils/fileValidation';
import { FAILURE_REASON_LABELS } from '../../utils/constants';
import { getErrorMessage } from '../../utils/helpers';

export default function ResumeUploader() {
  const inputRef = useRef(null);
  const [result, setResult] = useState(null); // detail object from the 201
  const [invalid, setInvalid] = useState(null); // client pre-check error
  const [uploadError, setUploadError] = useState(null); // API/network error
  const [uploading, setUploading] = useState(false);

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    setInvalid(null);
    setResult(null);

    const check = validateResumeFile(file);
    if (!check.valid) {
      setInvalid(check.message);
      return;
    }

    setUploading(true);
    try {
      const detail = await resumeService.uploadResume(file);
      setResult(detail);
    } catch (error) {
      setUploadError(getErrorMessage(error, 'Upload failed. Please try again.'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-dashed border-[#A3B18A] bg-white p-6 text-center shadow-[0_16px_40px_rgba(85,107,47,0.05)]">
        <p className="text-lg font-medium text-[#1F2937]">Upload Resume</p>
        <p className="mt-2 text-sm text-[#6B7280]">PDF or DOCX, up to 5MB</p>
        <div className="mt-4">
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={handleFileChange}
            data-testid="resume-file-input"
          />
          <Button type="button" onClick={() => inputRef.current?.click()} disabled={uploading}>
            Choose File
          </Button>
        </div>
        {uploading ? <div className="mt-4"><Loader label="Uploading and analyzing — this can take a moment..." /></div> : null}
        {invalid ? <p data-testid="upload-invalid" className="mt-4 text-sm text-red-600">{invalid}</p> : null}
        {uploadError ? <p data-testid="upload-error" className="mt-4 text-sm text-red-600">{uploadError}</p> : null}
      </div>

      {result ? (
        <div className="space-y-4">
          {result.status === 'FAILED' ? (
            <div data-testid="resume-failure" className="rounded-3xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
              <p className="font-medium">Analysis failed</p>
              <p className="mt-1">{FAILURE_REASON_LABELS[result.failureReason] || result.failureReason || 'Unknown error'}</p>
            </div>
          ) : (
            <ResumeDetail resume={result} onDelete={() => setResult(null)} />
          )}
        </div>
      ) : null}
    </div>
  );
}