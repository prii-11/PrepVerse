// Small reusable helper functions for class names, formatting, and mock timing.
export function cn(...values) {
  return values.filter(Boolean).join(' ');
}

export function formatPercent(value) {
  return `${Math.max(0, Math.min(100, Number(value) || 0))}%`;
}

export function createMockResponse(data) {
  return Promise.resolve({ data });
}

// Extracts the backend error envelope message (docs/02 §3:
// { error: { code, message, details } }) with a fallback for network/unknown
// failures.
export function getErrorMessage(error, fallback = 'Something went wrong. Please try again.') {
  return error?.response?.data?.error?.message || fallback;
}

// Mock-only: simulates network latency so loading states are real.
export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const DATE_FORMAT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export function formatDate(iso) {
  if (!iso) return '';
  return DATE_FORMAT.format(new Date(iso));
}

export function timeGreeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function initials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

// Presentation-only score banding for consistent status colors.
export function scoreTone(score) {
  if (score == null) return 'text-faint';
  if (score >= 75) return 'text-brand-deep';
  if (score >= 50) return 'text-ink';
  return 'text-danger';
}
