// Small reusable helper functions for class names and simple formatting.
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
