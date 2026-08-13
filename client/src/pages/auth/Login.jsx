// Login screen that connects to the AuthContext and navigates to the dashboard.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Eye, EyeOff } from 'lucide-react';
import Button from '../../components/common/Button';
import Input from '../../components/common/Input';
import useAuth from '../../hooks/useAuth';
import { ROUTES } from '../../utils/constants';

export default function Login() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', rememberMe: false });

  const handleSubmit = async (event) => {
    event.preventDefault();
    // Simulate login for demonstration
    await auth.login({ token: 'demo-token', user: { name: 'Aarav Sharma', email: form.email } });
    navigate(ROUTES.dashboard);
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

      <div className="mt-8 space-y-4">
        {/* Google Login Button */}
        <Button variant="secondary" className="w-full gap-3 py-3" onClick={() => {}}>
          <svg className="h-5 w-5" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Continue with Google
        </Button>

        {/* OR Divider */}
        <div className="relative flex items-center py-2">
          <div className="flex-grow border-t border-[#E5E7EB]"></div>
          <span className="mx-4 flex-shrink text-xs font-medium uppercase text-[#9CA3AF]">or</span>
          <div className="flex-grow border-t border-[#E5E7EB]"></div>
        </div>

        {/* Login Form */}
        <form className="space-y-5" onSubmit={handleSubmit}>
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

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-[#E5E7EB] text-[#556B2F] focus:ring-[#A3B18A]"
                checked={form.rememberMe}
                onChange={(e) => setForm({ ...form, rememberMe: e.target.checked })}
              />
              <span className="text-sm font-medium text-[#6B7280] group-hover:text-[#1F2937] transition-colors">
                Remember me
              </span>
            </label>
            <Link
              to="/forgot-password"
              className="text-sm font-semibold text-[#556B2F] hover:text-[#6B8E23] transition-colors"
            >
              Forgot password?
            </Link>
          </div>

          <Button className="w-full py-3 text-base" type="submit">
            Sign In
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
      </div>
    </motion.div>
  );
}
