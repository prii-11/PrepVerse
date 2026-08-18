// Login screen — authenticates against the backend auth contract
// (POST /auth/login) and navigates to the originally requested protected
// route when one triggered the redirect.
import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Eye, EyeOff } from 'lucide-react';
import Button from '../../components/common/Button';
import Input from '../../components/common/Input';
import useAuth from '../../hooks/useAuth';
import { ROUTES } from '../../utils/constants';
import { getErrorMessage } from '../../utils/helpers';

export default function Login() {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  if (auth.isAuthenticated) {
    return <Navigate to={ROUTES.dashboard} replace />;
  }

  const from = location.state?.from?.pathname || ROUTES.dashboard;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await auth.login(form);
      navigate(from, { replace: true });
    } catch (loginError) {
      setError(getErrorMessage(loginError, 'Login failed. Please try again.'));
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
        <p className="text-xs font-semibold uppercase tracking-widest text-[#6B8E23]">Enterprise Ready</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-[#1F2937]">Welcome Back</h1>
        <p className="mt-2 text-sm text-[#6B7280]">Please enter your details to sign in</p>
      </div>

      <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
        <Input
          label="Email Address"
          type="email"
          placeholder="name@company.com"
          required
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <div className="space-y-1">
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
        </div>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <Button className="w-full py-3 text-base" type="submit" disabled={submitting}>
          {submitting ? 'Signing in...' : 'Sign In'}
        </Button>
      </form>

      <p className="mt-8 text-center text-sm text-[#6B7280]">
        Don't have an account?{' '}
        <Link
          className="font-semibold text-[#556B2F] hover:text-[#6B8E23] transition-colors"
          to={ROUTES.signup}
        >
          Create an account
        </Link>
      </p>
    </motion.div>
  );
}