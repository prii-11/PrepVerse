// Profile — a clean personal workspace: identity, target role, experience
// level, skill profile, readiness. Only real fields; role choices are
// catalog-backed (docs/05), never free text.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Spinner from '../components/ui/Spinner';
import EmptyState from '../components/ui/EmptyState';
import { Select } from '../components/ui/Form';
import useAuth from '../hooks/useAuth';
import { userService, analyticsService } from '../services';
import { EXPERIENCE_LEVELS, ROUTES, TARGET_ROLES } from '../utils/constants';

const LEVEL_LABELS = {
  BEGINNER: 'Beginner',
  INTERMEDIATE: 'Intermediate',
  ADVANCED: 'Advanced',
};

function Section({ title, description, children }) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold tracking-tight text-ink">{title}</h2>
      {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function Profile() {
  const auth = useAuth();
  const [profile, setProfile] = useState(null);
  const [skillProfile, setSkillProfile] = useState(null);
  const [readiness, setReadiness] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    Promise.all([userService.getProfile(), userService.getSkillProfile(), analyticsService.getReadiness()])
      .then(([nextProfile, nextSkills, nextReadiness]) => {
        if (!active) return;
        setProfile(nextProfile);
        setForm(nextProfile);
        setSkillProfile(nextSkills);
        setReadiness(nextReadiness);
      })
      .catch((cause) => {
        if (active) setError(cause);
      });
    return () => {
      active = false;
    };
  }, []);

  const dirty = form && profile && (form.targetRole !== profile.targetRole || form.experienceLevel !== profile.experienceLevel);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const next = await userService.updateProfile(form);
      setProfile(next);
      setForm(next);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  if (error) {
    return (
      <EmptyState
        className="mt-10"
        title="Could not load your profile"
        description="Something went wrong while fetching your data. Please try again."
        action={<Button onClick={() => window.location.reload()}>Retry</Button>}
      />
    );
  }

  if (!profile) {
    return (
      <div className="flex justify-center py-24">
        <Spinner className="size-6 text-sage" />
      </div>
    );
  }

  const name = [auth.user?.firstName, auth.user?.lastName].filter(Boolean).join(' ') || 'You';

  return (
    <div className="mx-auto max-w-3xl animate-rise pb-4">
      <PageHeader title="Profile" description="Your personal workspace and interview targets." />

      <Section title="Personal information">
        <Card className="p-6">
          <dl className="grid gap-x-10 gap-y-5 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-faint">Name</dt>
              <dd className="mt-1 font-medium text-ink">{name}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-faint">Email</dt>
              <dd className="mt-1 font-medium text-ink">{auth.user?.email}</dd>
            </div>
          </dl>
        </Card>
      </Section>

      <Section title="Interview targets" description="Interviews are generated against these settings.">
        <Card className="p-6">
          <div className="grid gap-5 sm:grid-cols-2">
            <Select
              label="Target role"
              name="targetRole"
              value={form.targetRole}
              options={TARGET_ROLES}
              onChange={(event) => setForm({ ...form, targetRole: event.target.value })}
            />
            <Select
              label="Experience level"
              name="experienceLevel"
              value={form.experienceLevel}
              options={EXPERIENCE_LEVELS}
              onChange={(event) => setForm({ ...form, experienceLevel: event.target.value })}
            />
          </div>
          <div className="mt-6 flex items-center gap-3 border-t border-line pt-5">
            <Button size="sm" onClick={save} disabled={!dirty} loading={saving}>
              Save changes
            </Button>
            {saved ? <span className="text-sm text-brand">Saved</span> : null}
          </div>
        </Card>
      </Section>

      <Section
        title="Skill profile"
        description={
          skillProfile?.updatedAt
            ? `Built from your evaluated interviews · updated ${new Date(skillProfile.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
            : undefined
        }
      >
        <Card className="divide-y divide-line p-2">
          {(skillProfile?.skills || []).map((skill) => (
            <div key={skill.skillKey} className="flex items-center justify-between px-4 py-3.5">
              <span className="font-medium text-ink">{skill.skillKey}</span>
              <span
                className={
                  skill.assessed && skill.level
                    ? 'rounded-full bg-sage-soft px-2.5 py-1 text-xs font-medium text-brand-deep'
                    : 'rounded-full border border-line px-2.5 py-1 text-xs font-medium text-faint'
                }
              >
                {skill.assessed && skill.level ? LEVEL_LABELS[skill.level] : 'Not yet assessed'}
              </span>
            </div>
          ))}
        </Card>
      </Section>

      <Section title="Readiness">
        <Card className="flex flex-wrap items-center justify-between gap-4 p-6">
          <div className="flex items-baseline gap-2">
            <span className="text-[40px] font-semibold leading-none tracking-tight text-brand-deep tabular-nums">
              {readiness?.score ?? '—'}
            </span>
            <span className="text-sm text-faint">/ 100</span>
          </div>
          <Link to={ROUTES.progress} className="text-sm font-medium text-brand hover:text-brand-deep">
            See how it changed →
          </Link>
        </Card>
      </Section>
    </div>
  );
}
