// Signup — email/password registration only. No social login, no invented steps.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Button from '../../components/ui/Button';
import { Input } from '../../components/ui/Form';
import useAuth from '../../hooks/useAuth';
import { ROUTES } from '../../utils/constants';
import { getErrorMessage } from '../../utils/helpers';

export default function Signup() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const update = (key) => (event) => setForm({ ...form, [key]: event.target.value });

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await auth.signup(form);
      navigate(ROUTES.home, { replace: true });
    } catch (cause) {
      setError(getErrorMessage(cause, 'Could not create your account. Please try again.'));
      setSubmitting(false);
    }
  };

  return (
    <div className="animate-rise">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Create your account</h1>
      <p className="mt-1.5 text-sm text-muted">Start practicing in minutes.</p>

      <form onSubmit={submit} className="mt-8 space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <Input
            label="First name"
            name="firstName"
            autoComplete="given-name"
            value={form.firstName}
            onChange={update('firstName')}
            required
          />
          <Input
            label="Last name"
            name="lastName"
            autoComplete="family-name"
            value={form.lastName}
            onChange={update('lastName')}
            required
          />
        </div>
        <Input
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={form.email}
          onChange={update('email')}
          required
        />
        <Input
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          value={form.password}
          onChange={update('password')}
          minLength={8}
          required
        />

        {error ? (
          <p role="alert" className="rounded-xl border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-danger">
            {error}
          </p>
        ) : null}

        <Button type="submit" size="lg" loading={submitting} className="w-full">
          Create Account
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        Already have an account?{' '}
        <Link to={ROUTES.login} className="font-medium text-brand hover:text-brand-deep">
          Sign in
        </Link>
      </p>
    </div>
  );
}
