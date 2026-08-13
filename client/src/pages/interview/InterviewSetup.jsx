// Interview setup page that prepares the mock interview session.
import Button from '../../components/common/Button';

export default function InterviewSetup() {
  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-[#6B8E23]">Interview</p>
        <h1 className="mt-3 text-3xl font-semibold text-[#1F2937]">Configure your session</h1>
      </div>
      <div className="rounded-3xl border border-[#E5E7EB] bg-white p-5 shadow-[0_16px_40px_rgba(85,107,47,0.05)]">
        <p className="text-sm text-[#6B7280]">Session settings</p>
        <p className="mt-3 text-sm text-[#6B7280]">Select role, difficulty, and interview format before starting.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button>Start Interview</Button>
          <Button variant="secondary">Save Draft</Button>
        </div>
      </div>
    </section>
  );
}
