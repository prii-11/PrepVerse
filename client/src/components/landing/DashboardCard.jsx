import React from 'react';
import { motion } from 'framer-motion';
import { ArrowUpRight, BarChart3, BrainCircuit, MessageSquareText, ShieldCheck, Target, Sparkles } from 'lucide-react';

export default function DashboardCard() {
  // Top metric cards represent quick status KPIs for the mock dashboard.
  const summaryCards = [
    { label: 'Resume Score', value: 86, description: 'ATS-ready structure and clarity', icon: ShieldCheck },
    { label: 'Interview Score', value: 79, description: 'Better pacing and answer depth', icon: Target },
    { label: 'AI Readiness', value: 91, description: 'You are ready for guided practice', icon: Sparkles },
  ];

  const weeklyBars = [54, 62, 58, 73, 69, 81, 88];
  const weakAreas = ['Eye contact', 'Answer structure', 'Pacing'];

  function ProgressRing({ value, Icon }) {
    const radius = 44;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (value / 100) * circumference;

    return (
      <div className="relative flex h-28 w-28 items-center justify-center sm:h-32 sm:w-32">
        {/* SVG ring visualizes percentage with animated stroke offset. */}
        <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={radius} fill="none" stroke="#E5E7EB" strokeWidth="6" />
          <motion.circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke="#556B2F"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <Icon className="mb-1 h-4 w-4 text-[#556B2F]" />
          <span className="text-xl font-semibold text-[#1F2937]">{value}%</span>
        </div>
      </div>
    );
  }

  function MetricCard({ label, value, description, icon: Icon, delay }) {
    return (
      <motion.article
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: 'easeOut', delay }}
        whileHover={{ y: -4 }}
        className="rounded-[24px] border border-[#E5E7EB] bg-white p-5 shadow-[0_16px_40px_rgba(85,107,47,0.06)]"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-[#6B7280]">{label}</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-[#1F2937]">{value}%</p>
          </div>
          <div className="rounded-2xl border border-[#DAD7CD] bg-[#F8F9F5] p-3 text-[#556B2F]">
            <Icon className="h-5 w-5" />
          </div>
        </div>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[#F3F4F6]">
          {/* Progress bar animates from 0 to value for a polished data reveal. */}
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${value}%` }}
            transition={{ duration: 1, ease: 'easeOut', delay: delay + 0.15 }}
            className="h-full rounded-full bg-[#556B2F]"
          />
        </div>
        <p className="mt-3 text-sm leading-6 text-[#6B7280]">{description}</p>
      </motion.article>
    );
  }

  function SurfaceCard({ title, eyebrow, children, className = '' }) {
    return (
      <div className={`rounded-[28px] border border-[#E5E7EB] bg-white p-5 shadow-[0_18px_50px_rgba(85,107,47,0.06)] sm:p-6 ${className}`}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#6B8E23]">{eyebrow}</p>
            <h4 className="mt-2 text-lg font-semibold text-[#1F2937]">{title}</h4>
          </div>
        </div>
        {children}
      </div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 36 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.75, ease: 'easeOut', delay: 0.35 }}
      className="relative mt-10 w-full max-w-7xl"
    >
      {/* The soft shadow blob keeps the dashboard floating above the page. */}
      <div className="absolute -inset-8 -z-10 rounded-[40px] bg-[radial-gradient(circle_at_top,rgba(163,177,138,0.18),transparent_55%)] blur-2xl" />

      <motion.div
        // Slow floating loop reinforces the hero's premium, airy feel.
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
        className="rounded-[32px] border border-[#DAD7CD] bg-white p-4 shadow-[0_24px_80px_rgba(85,107,47,0.08)] sm:p-6 lg:p-8"
      >
        <div className="mb-6 flex flex-col gap-3 border-b border-[#E5E7EB] pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#6B8E23]">Live dashboard</p>
            <h3 className="mt-2 text-2xl font-semibold tracking-tight text-[#1F2937] sm:text-3xl">
              Your practice snapshot
            </h3>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#DAD7CD] bg-[#F8F9F5] px-4 py-2 text-sm text-[#556B2F]">
            <BarChart3 className="h-4 w-4" />
            Weekly growth: +14%
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {summaryCards.map((card, index) => (
            <MetricCard
              key={card.label}
              label={card.label}
              value={card.value}
              description={card.description}
              icon={card.icon}
              delay={0.15 * index}
            />
          ))}
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-[1.6fr_1fr]">
          <SurfaceCard title="Progress Graph" eyebrow="Performance trend">
            <div className="flex h-52 items-end gap-3 sm:h-60">
              {weeklyBars.map((value, index) => (
                <div key={index} className="flex flex-1 flex-col items-center gap-3">
                  <div className="flex w-full flex-1 items-end">
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: `${value}%` }}
                      transition={{ duration: 0.9, ease: 'easeOut', delay: 0.15 + index * 0.08 }}
                      className="w-full rounded-t-2xl bg-[linear-gradient(180deg,#A3B18A_0%,#556B2F_100%)] shadow-[0_10px_20px_rgba(85,107,47,0.16)]"
                    />
                  </div>
                  <span className="text-xs text-[#9CA3AF]">W{index + 1}</span>
                </div>
              ))}
            </div>
          </SurfaceCard>

          <div className="space-y-4">
            <SurfaceCard title="Weak Areas" eyebrow="Focus next">
              <ul className="space-y-3">
                {weakAreas.map((area) => (
                  <li key={area} className="flex items-center justify-between rounded-2xl bg-[#F8F9F5] px-4 py-3 text-sm text-[#1F2937]">
                    <span>{area}</span>
                    <ArrowUpRight className="h-4 w-4 text-[#6B8E23]" />
                  </li>
                ))}
              </ul>
            </SurfaceCard>

            <SurfaceCard title="Feedback Card" eyebrow="AI coach">
              <div className="space-y-3 text-sm leading-6 text-[#6B7280]">
                <div className="flex items-center gap-2 text-[#556B2F]">
                  <MessageSquareText className="h-4 w-4" />
                  Immediate coaching notes
                </div>
                <p>
                  Strong structure and confident tone. Add one concrete metric and slow down slightly in the opening
                  sentence.
                </p>
                <div className="rounded-2xl border border-[#DAD7CD] bg-[#F8F9F5] p-4 text-[#1F2937]">
                  <div className="flex items-center gap-2 text-sm font-medium text-[#556B2F]">
                    <BrainCircuit className="h-4 w-4" />
                    Next suggestion
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[#6B7280]">
                    Record a second attempt and compare the tone, pacing, and keyword coverage.
                  </p>
                </div>
              </div>
            </SurfaceCard>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
