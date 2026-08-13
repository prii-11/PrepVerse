/**
 * Landing page theme tokens for the white-and-olive visual system.
 */

export const THEME_COLORS = {
  background: {
    primary: '#FFFFFF',
    secondary: '#F8F9F5',
    card: '#FFFFFF',
    glass: 'rgba(255, 255, 255, 0.78)',
  },
  olive: {
    primary: '#556B2F',
    secondary: '#6B8E23',
    light: '#A3B18A',
    soft: '#DAD7CD',
  },
  text: {
    primary: '#1F2937',
    secondary: '#6B7280',
    muted: '#9CA3AF',
  },
  border: {
    default: '#E5E7EB',
    olive: 'rgba(85, 107, 47, 0.18)',
  },
};

export const LANDING_COPY = {
  heroPrefix: 'AI Practice Studio for',
  subtitle: 'Practice. Track. Improve.',
};

export const ANIMATION_DURATIONS = {
  slow: 0.8,
  normal: 0.55,
  fast: 0.28,
};

export const Z_INDEXES = {
  background: 0,
  content: 10,
  navbar: 50,
  modal: 100,
};

export const BREAKPOINTS = {
  mobile: '640px',
  tablet: '768px',
  desktop: '1024px',
  wide: '1280px',
};
