// Live interview screen that stitches together the question, timer, and response tools.
import AnswerBox from '../../components/interview/AnswerBox';
import InterviewProgress from '../../components/interview/InterviewProgress';
import QuestionCard from '../../components/interview/QuestionCard';
import Timer from '../../components/interview/Timer';
import VoiceRecorder from '../../components/interview/VoiceRecorder';

export default function InterviewScreen() {
  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-[#6B8E23]">Interview Screen</p>
        <h1 className="mt-3 text-3xl font-semibold text-[#1F2937]">Practice with AI questions</h1>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <QuestionCard />
        <Timer />
        <InterviewProgress />
        <VoiceRecorder />
      </div>
      <AnswerBox />
    </section>
  );
}
