// Student profile page that shows editable identity and goals.
import { useContext } from 'react';
import Button from '../../components/common/Button';
import { UserContext } from '../../context/UserContext';

export default function StudentProfile() {
  const userContext = useContext(UserContext);

  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-[#6B8E23]">Profile</p>
        <h1 className="mt-3 text-3xl font-semibold text-[#1F2937]">Student Profile</h1>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-3xl border border-[#E5E7EB] bg-white p-5 shadow-[0_16px_40px_rgba(85,107,47,0.05)]">
          <p className="text-sm text-[#6B7280]">Name</p>
          <p className="mt-2 text-lg text-[#1F2937]">{userContext?.profile?.name}</p>
          <p className="mt-4 text-sm text-[#6B7280]">Target Role</p>
          <p className="mt-2 text-[#1F2937]">{userContext?.profile?.targetRole}</p>
        </div>
        <div className="rounded-3xl border border-[#E5E7EB] bg-white p-5 shadow-[0_16px_40px_rgba(85,107,47,0.05)]">
          <p className="text-sm text-[#6B7280]">University</p>
          <p className="mt-2 text-lg text-[#1F2937]">{userContext?.profile?.university}</p>
          <p className="mt-4 text-sm text-[#6B7280]">Readiness</p>
          <p className="mt-2 text-[#1F2937]">{userContext?.profile?.readiness}%</p>
        </div>
      </div>
      <Button>Update Profile</Button>
    </section>
  );
}
