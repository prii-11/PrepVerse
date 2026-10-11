// InterviewSetup — preparation before entering a real interview.
// Focused configuration only: role, difficulty, question count. No dashboard.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Button, { buttonClass } from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';
import { ChoiceGroup, SegmentedControl } from '../../components/ui/ChoiceGroup';
import EmptyState from '../../components/ui/EmptyState';
import { interviewService } from '../../services';
import {
  DIFFICULTIES,
  QUESTION_COUNTS,
  ROUTES,
  TARGET_ROLES,
  interviewRoomPath,
} from '../../utils/constants';
import { getErrorMessage } from '../../utils/helpers';

const DIFFICULTY_OPTIONS = [
  { value: 'Easy', label: 'Easy', hint: 'Warmer pacing, foundational questions' },
  { value: 'Medium', label: 'Medium', hint: 'Realistic screening-level depth' },
  { value: 'Hard', label: 'Hard', hint: 'Senior probing and trade-off questions' },
];

export default function InterviewSetup() {
  const navigate = useNavigate();
  const [targetRole, setTargetRole] = useState(TARGET_ROLES[0]);
  const [difficulty, setDifficulty] = useState('Medium');
  const [questionCount, setQuestionCount] = useState(4);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  const startInterview = async () => {
    setCreating(true);
    setError(null);
    try {
      const interview = await interviewService.createInterview({
        targetRole,
        difficulty,
        questionCount,
      });
      navigate(interviewRoomPath(interview._id), { replace: true });
    } catch (cause) {
      setError(getErrorMessage(cause, 'Could not create the interview. Please try again.'));
      setCreating(false);
    }
  };

  if (creating) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center text-center animate-fade">
        <Spinner className="size-7 text-brand" />
        <h1 className="mt-6 text-xl font-semibold tracking-tight text-ink">
          Preparing your interview
        </h1>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">
          Generating {questionCount} {difficulty.toLowerCase()} questions for{' '}
          {targetRole}. This takes a moment.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl animate-rise pb-4">
      <Link to={ROUTES.interviews} className={buttonClass('ghost', 'sm', '-ml-3')}>
        ← Back
      </Link>

      <div className="mt-6">
        <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-ink md:text-[32px]">
          Prepare for your interview
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">
          Choose what you want to practice.
        </p>
      </div>

      <section className="mt-10" aria-label="Interview configuration">
        <h2 className="text-sm font-medium uppercase tracking-wide text-faint">
          Interview configuration
        </h2>

        <div className="mt-5 space-y-8">
          <ChoiceGroup
            label="Target role"
            options={TARGET_ROLES.map((role) => ({ value: role, label: role }))}
            value={targetRole}
            onChange={setTargetRole}
          />
          <ChoiceGroup
            label="Difficulty"
            options={DIFFICULTY_OPTIONS}
            value={difficulty}
            onChange={setDifficulty}
          />
          <SegmentedControl
            label="Question count"
            options={QUESTION_COUNTS}
            value={questionCount}
            onChange={setQuestionCount}
          />
        </div>
      </section>

      {error ? (
        <EmptyState
          className="mt-8 border-solid"
          title="Could not start the interview"
          description={error}
        />
      ) : null}

      <div className="mt-12 flex justify-end border-t border-line pt-6">
        <Button size="lg" onClick={startInterview}>
          Start Interview
        </Button>
      </div>
    </div>
  );
}
