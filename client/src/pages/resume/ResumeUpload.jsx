// Resume upload page that hosts the file intake experience.
import ResumeUploader from '../../components/resume/ResumeUploader';

export default function ResumeUpload() {
  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-[#6B8E23]">Resume</p>
        <h1 className="mt-3 text-3xl font-semibold text-[#1F2937]">Upload your resume</h1>
      </div>
      <ResumeUploader />
    </section>
  );
}
