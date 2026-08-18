// Signup screen — registers against the backend auth contract
// (POST /auth/register). Registration auto-authenticates, so a successful
// response carries a token and the user is taken to the dashboard.
import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Eye, EyeOff } from 'lucide-react';
import Button from '../../components/common/Button';
import Input from '../../components/common/Input';
import useAuth from '../../hooks/useAuth';
import { ROUTES } from '../../utils/constants';
import { getErrorMessage } from '../../utils/helpers';

export default function Signup() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  if (auth.isAuthenticated) {
    return <Navigate to={ROUTES.dashboard} replace />;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      await auth.signup({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email,
        password: form.password,
      });
      navigate(ROUTES.dashboard, { replace: true });
    } catch (signupError) {
      setError(getErrorMessage(signupError, 'Signup failed. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-[#6B8E23]">Free Access</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-[#1F2937]">Create Account</h1>
        <p className="mt-2 text-sm text-[#6B7280]">Join 10,000+ candidates today</p>
      </div>

      <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="First Name"
            placeholder="John"
            required
            value={form.firstName}
            onChange={(e) => setForm({ ...form, firstName: e.target.value })}
          />
          <Input
            label="Last Name"
            placeholder="Doe"
            required
            value={form.lastName}
            onChange={(e) => setForm({ ...form, lastName: e.target.value })}
          />
        </div>
        <Input
          label="Email Address"
          type="email"
          placeholder="john@example.com"
          required
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <Input
          label="Password"
          type={showPassword ? 'text' : 'password'}
          placeholder="••••••••"
          required
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          rightElement={
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="focus:outline-none"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          }
        />
        <Input
          label="Confirm Password"
          type={showPassword ? 'text' : 'password'}
          placeholder="••••••••"
          required
          value={form.confirmPassword}
          onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
        />

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <Button className="w-full py-3 mt-2 text-base" type="submit" disabled={submitting}>
          {submitting ? 'Creating account...' : 'Create Account'}
        </Button>
      </form>

      <p className="mt-8 text-center text-sm text-[#6B7280]">
        Already have an account?{' '}
        <Link
          className="font-semibold text-[#556B2F] hover:text-[#6B8E23] transition-colors"
          to={ROUTES.login}
        >
          Sign in
        </Link>
      </p>
    </motion.div>
  );
}