// Answer input area used by the interview practice screen.
import Button from '../common/Button';

export default function AnswerBox() {
  return (
    <div className="rounded-3xl border border-[#E5E7EB] bg-white p-5 shadow-[0_16px_40px_rgba(85,107,47,0.05)]">
      <p className="text-sm text-[#6B7280]">Answer</p>
      <textarea
        rows="6"
        className="mt-3 w-full rounded-2xl border border-[#E5E7EB] bg-[#F8F9F5] p-4 text-sm text-[#1F2937] outline-none placeholder:text-[#9CA3AF] focus:border-[#A3B18A]"
        placeholder="Type your response here..."
      />
      <div className="mt-4 flex flex-wrap gap-3">
        <Button>Save Answer</Button>
        <Button variant="secondary">Review Feedback</Button>
      </div>
    </div>
  );
}
