// Student profile — real identity from auth, onboarding profile from the
// users API (targetRole is validated against the RoleSkillCatalog by the
// backend), and live readiness from analytics.
import { useContext, useState } from 'react';
import Button from '../../components/common/Button';
import Input from '../../components/common/Input';
import Loader from '../../components/common/Loader';
import { UserContext } from '../../context/UserContext';
import useAuth from '../../hooks/useAuth';
import { analyticsService } from '../../services/analyticsService';
import { getErrorMessage } from '../../utils/helpers';

const EXPERIENCE_LEVELS = ['Student', 'Entry', 'Junior'];

export default function StudentProfile() {
  const auth = useAuth();
  const userContext = useContext(UserContext);
  const [form, setForm] = useState({ targetRole: '', experienceLevel: '' });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [readiness, setReadiness] = useState(null);
  const [readinessError, setReadinessError] = useState(null);

  const loadReadiness = async () => {
    setReadinessError(null);
    try {
      const { score } = await analyticsService.getReadiness();
      setReadiness(score);
    } catch (error) {
      setReadinessError(getErrorMessage(error));
    }
  };

  if (!auth.user) return null;

  const identity = auth.user;
  const profile = userContext.profile;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const patch = {};
      if (form.targetRole.trim()) patch.targetRole = form.targetRole.trim();
      if (form.experienceLevel) patch.experienceLevel = form.experienceLevel;
      await userContext.updateProfile(patch);
      setSaved(true);
    } catch (error) {
      setSaveError(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-[#6B8E23]">Profile</p>
        <h1 className="mt-3 text-3xl font-semibold text-[#1F2937]">Student Profile</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-3xl border border-[#E5E7EB] bg-white p-5 shadow-[0_16px_40px_rgba(85,107,47,0.05)]">
          <p className="text-sm text-[#6B7280]">Name</p>
          <p className="mt-2 text-lg text-[#1F2937]">{identity.firstName} {identity.lastName}</p>
          <p className="mt-4 text-sm text-[#6B7280]">Email</p>
          <p className="mt-2 text-[#1F2937]">{identity.email}</p>
        </div>
        <div className="rounded-3xl border border-[#E5E7EB] bg-white p-5 shadow-[0_16px_40px_rgba(85,107,47,0.05)]">
          <p className="text-sm text-[#6B7280]">Target Role</p>
          <p className="mt-2 text-[#1F2937]">{profile?.targetRole ?? 'Not set'}</p>
          <p className="mt-4 text-sm text-[#6B7280]">Experience Level</p>
          <p className="mt-2 text-[#1F2937]">{profile?.experienceLevel ?? 'Not set'}</p>
          <p className="mt-4 text-sm text-[#6B7280]">Readiness</p>
          <p className="mt-2 text-[#1F2937]">{readinessError ? readinessError : readiness === null ? 'No interviews yet' : `${Math.round(readiness)}%`}</p>
        </div>
      </div>

      {userContext.profileLoading ? <Loader label="Loading profile..." /> : null}

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="rounded-3xl border border-[#E5E7EB] bg-white p-5 shadow-[0_16px_40px_rgba(85,107,47,0.05)]">
          <p className="text-sm font-medium text-[#1F2937]">Onboarding</p>
          <p className="mt-1 text-sm text-[#6B7280]">Your target role is validated against the role catalog; use the exact role name.</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Input
              label="Target Role"
              placeholder="e.g. Frontend Developer"
              value={form.targetRole}
              onChange={(e) => { setForm({ ...form, targetRole: e.target.value }); setSaved(false); }}
            />
            <div className="flex flex-col gap-2">
              <label className="text-sm text-[#6B7280]">
                <span className="font-medium text-[#1F2937]">Experience Level</span>
              </label>
              <select
                className="w-full rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-[#1F2937] outline-none transition focus:border-[#A3B18A]"
                value={form.experienceLevel}
                onChange={(e) => { setForm({ ...form, experienceLevel: e.target.value }); setSaved(false); }}
              >
                <option value="">Select...</option>
                {EXPERIENCE_LEVELS.map((level) => (
                  <option key={level} value={level}>{level}</option>
                ))}
              </select>
            </div>
          </div>

          {saveError ? (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {saveError}
            </div>
          ) : null}
          {saved ? (
            <div className="mt-4 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              Profile saved.
            </div>
          ) : null}

          <div className="mt-4 flex items-center gap-3">
            <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Profile'}</Button>
            <Button variant="secondary" type="button" onClick={loadReadiness}>Refresh Readiness</Button>
          </div>
        </div>
      </form>
    </section>
  );
}