// ScoreTrend — minimal SVG line for chronological interview scores.
// Pure presentation: renders exactly the points the analytics API returns.
import { formatDate } from '../../utils/helpers';

export default function ScoreTrend({ points = [], height = 120, className }) {
  if (points.length === 0) return null;

  const width = 560;
  const padX = 8;
  const padY = 14;
  const scores = points.map((point) => point.overallScore);
  const min = Math.min(...scores, 40);
  const max = Math.max(...scores, 100);

  const x = (index) =>
    points.length === 1 ? width / 2 : padX + (index * (width - padX * 2)) / (points.length - 1);
  const y = (score) => padY + ((max - score) / (max - min || 1)) * (height - padY * 2);

  const path = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${x(index).toFixed(1)},${y(point.overallScore).toFixed(1)}`)
    .join(' ');

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      role="img"
      aria-label={`Score progression across ${points.length} interviews`}
    >
      {[0.25, 0.5, 0.75].map((fraction) => (
        <line
          key={fraction}
          x1={padX}
          x2={width - padX}
          y1={padY + fraction * (height - padY * 2)}
          y2={padY + fraction * (height - padY * 2)}
          stroke="#e5e7eb"
          strokeDasharray="3 5"
          strokeWidth="1"
        />
      ))}
      <path d={path} fill="none" stroke="#556b2f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((point, index) => (
        <g key={point.interviewId ?? index}>
          <circle cx={x(index)} cy={y(point.overallScore)} r="4" fill="#ffffff" stroke="#556b2f" strokeWidth="2" />
          <title>{`${formatDate(point.completedAt)} — ${point.overallScore}/100`}</title>
        </g>
      ))}
    </svg>
  );
}
