// InterviewRoom — the dedicated interview experience.
// The question is the primary visual focus; the answer box is one of the
// largest elements on the page. Blank answers are allowed end-to-end: the
// backend scores them 0 at evaluation time (docs/20 §3), so Next is never
// disabled for an empty answer and no "required" errors are shown.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import InterviewShell, { InterviewProgressStrip } from '../../components/layout/InterviewShell';
import Button from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import EvaluatingScreen from './EvaluatingScreen';
import { interviewService } from '../../services';
import { ROUTES, reportPath } from '../../utils/constants';

export default function InterviewRoom() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [interview, setInterview] = useState(null);
  const [answers, setAnswers] = useState({}); // questionId → text (local, unsaved)
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [advancing, setAdvancing] = useState(false); // POST /answers in flight
  const [submitting, setSubmitting] = useState(false);
  const [submitStartedAt, setSubmitStartedAt] = useState(null);
  const [exitOpen, setExitOpen] = useState(false);
  const [exiting, setExiting] = useState(false);

  const questions = useMemo(() => interview?.questions ?? [], [interview]);
  const current = questions[currentIndex];
  const isLast = currentIndex === questions.length - 1;
  const answerText = current ? answers[current._id] ?? '' : '';

  // Guard against closing the tab mid-evaluation (docs/20 §10).
  useEffect(() => {
    if (!submitting) return undefined;
    const onBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [submitting]);

  // Load + auto-start. Restores an IN_PROGRESS session at its first
  // unanswered question; terminal states route elsewhere.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        let detail = await interviewService.getInterview(id);
        if (detail.status === 'CREATED') {
          await interviewService.startInterview(id);
          detail = { ...detail, status: 'IN_PROGRESS' };
        }
        if (!active) return;
        if (detail.status === 'COMPLETED') {
          navigate(reportPath(id), { replace: true });
          return;
        }
        if (!['IN_PROGRESS', 'SUBMITTED', 'EVALUATING'].includes(detail.status)) {
          navigate(ROUTES.interviews, { replace: true });
          return;
        }
        const savedAnswers = {};
        detail.answers.forEach((answer) => {
          savedAnswers[answer.questionId] = answer.text;
        });
        setInterview(detail);
        setAnswers(savedAnswers);
        setCurrentIndex(Math.min(detail.answers.length, detail.questions.length - 1));
      } catch (cause) {
        if (active) setLoadError(cause);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id, navigate]);

  const saveAnswer = useCallback(
    async (questionId, text) => {
      await interviewService.addAnswer(id, { questionId, text });
    },
    [id],
  );

  const advance = async () => {
    if (!current || advancing || submitting) return;
    setAdvancing(true);
    try {
      await saveAnswer(current._id, answerText);
      if (isLast) {
        setSubmitting(true);
        setSubmitStartedAt(Date.now());
        const result = await interviewService.submitInterview(id);
        navigate(reportPath(result._id), { replace: true });
      } else {
        setCurrentIndex((value) => value + 1);
      }
    } catch {
      setAdvancing(false);
      setSubmitting(false);
    }
  };

  const exitInterview = async () => {
    setExiting(true);
    try {
      await interviewService.cancelInterview(id);
    } finally {
      navigate(ROUTES.interviews, { replace: true });
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="size-6 text-sage" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center px-5">
        <EmptyState
          className="max-w-md border-solid"
          title="Interview not found"
          description="This interview may belong to another account or may have been removed."
          action={<Button onClick={() => navigate(ROUTES.interviews)}>Back to Interviews</Button>}
        />
      </div>
    );
  }

  if (submitting) {
    return (
      <div className="min-h-screen">
        <header className="border-b border-line/80 bg-paper/90 backdrop-blur-md">
          <div className="mx-auto flex h-16 w-full max-w-[1280px] items-center justify-between px-5 md:px-8">
            <span className="text-[17px] font-semibold tracking-tight text-ink">PrepVerse</span>
            <span className="text-sm text-muted">Evaluating</span>
            <span className="w-14" />
          </div>
        </header>
        <main className="mx-auto max-w-[760px] px-5 md:px-8">
          <EvaluatingScreen startedAt={submitStartedAt} />
        </main>
      </div>
    );
  }

  if (!current) return null;

  return (
    <InterviewShell
      questionNumber={currentIndex + 1}
      questionTotal={questions.length}
      exiting={exiting}
      onExit={() => setExitOpen(true)}
    >
      <InterviewProgressStrip total={questions.length} current={currentIndex} />

      {/* THE QUESTION — primary visual focus, generous whitespace */}
      <section className="text-center" aria-live="polite">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">
          Question {currentIndex + 1}
        </p>
        <p className="mt-2 text-xs text-faint">
          {current.category} · {current.difficulty}
        </p>
        <h1
          key={current._id}
          className="mx-auto mt-6 max-w-2xl animate-rise text-[26px] font-semibold leading-snug tracking-tight text-ink md:text-[30px]"
        >
          {current.text}
        </h1>
      </section>

      {/* ANSWER AREA — large, calm, never blocks on empty input */}
      <section className="mt-10">
        <label htmlFor="answer" className="sr-only">
          Your answer
        </label>
        <textarea
          id="answer"
          value={answerText}
          onChange={(event) =>
            setAnswers((previous) => ({ ...previous, [current._id]: event.target.value }))
          }
          placeholder="Your answer..."
          rows={9}
          autoFocus
          className="block w-full resize-y rounded-2xl border border-line bg-paper px-5 py-4 text-[16px] leading-relaxed text-ink shadow-card transition-all duration-150 placeholder:text-faint hover:border-sage/70 focus:border-sage focus:outline-none focus:ring-4 focus:ring-brand/10"
        />
      </section>

      {/* ACTION AREA — obvious but restrained */}
      <div className="mt-8 flex flex-col-reverse items-center gap-4 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={() => setExitOpen(true)}
          disabled={advancing}
          className="text-sm font-medium text-muted transition-colors hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage rounded-lg px-2 py-1"
        >
          Leave Interview
        </button>

        <Button size="lg" onClick={advance} loading={advancing}>
          {isLast ? 'Submit Interview' : 'Next Question'}
        </Button>
      </div>

      {/* EXIT CONFIRMATION */}
      {exitOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-5 backdrop-blur-sm animate-fade"
          role="dialog"
          aria-modal="true"
          aria-label="Leave interview"
        >
          <div className="w-full max-w-sm rounded-2xl border border-line bg-paper p-6 shadow-pop">
            <h2 className="text-lg font-semibold tracking-tight text-ink">Leave this interview?</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              If you leave now, the interview will be cancelled and your answers will not be
              evaluated.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setExitOpen(false)} disabled={exiting}>
                Keep practicing
              </Button>
              <Button variant="danger" onClick={exitInterview} loading={exiting}>
                Leave &amp; cancel
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </InterviewShell>
  );
}
