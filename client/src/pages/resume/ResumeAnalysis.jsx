// Resume analysis page that displays scoring and suggestions.
import ResumeScore from '../../components/resume/ResumeScore';
import ResumeSuggestion from '../../components/resume/ResumeSuggestion';

export default function ResumeAnalysis() {
  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-[#6B8E23]">Resume Analysis</p>
        <h1 className="mt-3 text-3xl font-semibold text-[#1F2937]">Review your resume score</h1>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <ResumeScore />
        <ResumeSuggestion suggestions={['Quantify outcomes', 'Add key technologies', 'Trim unrelated experience']} />
      </div>
    </section>
  );
}
