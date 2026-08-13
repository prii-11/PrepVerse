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
