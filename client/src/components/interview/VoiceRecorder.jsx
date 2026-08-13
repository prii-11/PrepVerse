// Voice recorder placeholder that can be connected to audio APIs later.
import Button from '../common/Button';

export default function VoiceRecorder() {
  return (
    <div className="rounded-3xl border border-[#E5E7EB] bg-white p-5 shadow-[0_16px_40px_rgba(85,107,47,0.05)]">
      <p className="text-sm text-[#6B7280]">Voice Recorder</p>
      <p className="mt-2 text-sm text-[#6B7280]">Audio capture is mocked for now.</p>
      <div className="mt-4">
        <Button variant="secondary">Start Recording</Button>
      </div>
    </div>
  );
}
