// Login — minimal, focused entry. No invented auth features (no Google,
// no password recovery): the backend contract is email + password only.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Button from '../../components/ui/Button';
import { Input } from '../../components/ui/Form';
import useAuth from '../../hooks/useAuth';
import { ROUTES } from '../../utils/constants';
import { getErrorMessage } from '../../utils/helpers';

export default function Login() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await auth.login({ email, password });
      navigate(ROUTES.home, { replace: true });
    } catch (cause) {
      setError(getErrorMessage(cause, 'Could not sign you in. Check your email and password.'));
      setSubmitting(false);
    }
  };

  return (
    <div className="animate-rise">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Welcome back</h1>
      <p className="mt-1.5 text-sm text-muted">Sign in to continue preparing.</p>

      <form onSubmit={submit} className="mt-8 space-y-5">
        <Input
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <Input
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />

        {error ? (
          <p role="alert" className="rounded-xl border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-danger">
            {error}
          </p>
        ) : null}

        <Button type="submit" size="lg" loading={submitting} className="w-full">
          Sign In
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        New to PrepVerse?{' '}
        <Link to={ROUTES.signup} className="font-medium text-brand hover:text-brand-deep">
          Create an account
        </Link>
      </p>
    </div>
  );
}
