// Resume upload card that demonstrates the intake step in the flow.
import Button from '../common/Button';

export default function ResumeUploader() {
  return (
    <div className="rounded-3xl border border-dashed border-[#A3B18A] bg-white p-6 text-center shadow-[0_16px_40px_rgba(85,107,47,0.05)]">
      <p className="text-lg font-medium text-[#1F2937]">Upload Resume</p>
      <p className="mt-2 text-sm text-[#6B7280]">Accepts PDF and DOCX in the future. This is a placeholder uploader.</p>
      <div className="mt-4">
        <Button>Choose File</Button>
      </div>
    </div>
  );
}
