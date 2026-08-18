// Resume analysis page — the backend resume list with detail navigation
// (list → select → detail). List, detail, download, and delete all mirror
// the verified resume API contract.
import { useState } from 'react';
import ResumeList from '../resumes/ResumeList';
import ResumeDetail from '../resumes/ResumeDetail';

export default function ResumeAnalysis() {
  const [selectedId, setSelectedId] = useState(null);

  if (selectedId) {
    return (
      <section className="space-y-6">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-[#6B8E23]">Resume Analysis</p>
          <h1 className="mt-3 text-3xl font-semibold text-[#1F2937]">Resume analysis</h1>
        </div>
        <ResumeDetail
          resumeId={selectedId}
          onBack={() => setSelectedId(null)}
          onDelete={() => setSelectedId(null)}
        />
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-[#6B8E23]">Resume Analysis</p>
        <h1 className="mt-3 text-3xl font-semibold text-[#1F2937]">Review your resume</h1>
      </div>
      <ResumeList onSelect={setSelectedId} />
    </section>
  );
}