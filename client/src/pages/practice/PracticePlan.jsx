// Practice plan page — real skill gaps from the analytics practice-plan
// endpoint (docs/08 §7). Each gap renders as a card with its reason and
// current vs required level; empty states are explicit.
import { useEffect, useState } from 'react';
import PracticeCard from '../../components/practice/PracticeCard';
import Loader from '../../components/common/Loader';
import Button from '../../components/common/Button';
import { analyticsService } from '../../services/analyticsService';
import { getErrorMessage } from '../../utils/helpers';

const REASON_LABELS = {
  missing: 'Not present in your skill profile',
  unassessed: 'Present but not yet assessed',
  'under-level': 'Assessed below the required level',
};

export default function PracticePlan() {
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await analyticsService.getPracticePlan();
      setPlan(next);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-[#6B8E23]">Practice</p>
        <h1 className="mt-3 text-3xl font-semibold text-[#1F2937]">Practice plan</h1>
        {plan?.targetRole ? (
          <p className="mt-2 text-sm text-[#6B7280]">Target role: {plan.targetRole}</p>
        ) : null}
      </div>

      {loading ? <Loader label="Building your practice plan..." /> : null}
      {error ? (
        <div className="space-y-3">
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
          <Button variant="secondary" onClick={load}>Retry</Button>
        </div>
      ) : null}

      {!loading && !error && plan ? (
        plan.skillGaps.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {plan.skillGaps.map((gap) => (
              <PracticeCard
                key={gap.skillKey}
                title={gap.skillKey}
                description={`${REASON_LABELS[gap.reason] || gap.reason}. Required level: ${gap.requiredMinimumLevel}${gap.currentLevel ? `, current: ${gap.currentLevel}` : ''}`}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-3xl border border-[#E5E7EB] bg-white p-5 text-sm text-[#6B7280] shadow-[0_16px_40px_rgba(85,107,47,0.05)]">
            {plan.targetRole
              ? 'No skill gaps detected for your target role — keep practicing.'
              : 'Set a target role in your profile to generate a practice plan.'}
          </div>
        )
      ) : null}
    </section>
  );
}