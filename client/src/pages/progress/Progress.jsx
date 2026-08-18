// Progress page — real score trend from the analytics progress endpoint.
// Shows the latest score and the completed-interview score series; empty
// states are rendered explicitly.
import { useEffect, useState } from 'react';
import ProgressGraph from '../../components/dashboard/ProgressGraph';
import ScoreCard from '../../components/dashboard/ScoreCard';
import Loader from '../../components/common/Loader';
import Button from '../../components/common/Button';
import { analyticsService } from '../../services/analyticsService';
import { getErrorMessage } from '../../utils/helpers';

export default function Progress() {
  const [points, setPoints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { points: next } = await analyticsService.getProgress();
      setPoints(next);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const latest = points.length > 0 ? points[points.length - 1].overallScore : null;

  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-[#6B8E23]">Progress</p>
        <h1 className="mt-3 text-3xl font-semibold text-[#1F2937]">Track your growth</h1>
      </div>

      {loading ? <Loader label="Loading your progress..." /> : null}
      {error ? (
        <div className="space-y-3">
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
          <Button variant="secondary" onClick={load}>Retry</Button>
        </div>
      ) : null}

      {!loading && !error ? (
        <div className="grid gap-4 md:grid-cols-2">
          <ScoreCard title="Latest Score" value={latest} subtitle={points.length > 0 ? `${points.length} completed interview${points.length === 1 ? '' : 's'}` : 'No completed interviews yet'} />
          <ProgressGraph points={points} />
        </div>
      ) : null}
    </section>
  );
}