// Shared application constants: routes, navigation model, and domain vocabularies.
export const APP_NAME = 'PrepVerse';

export const ROUTES = {
  landing: '/',
  login: '/login',
  signup: '/signup',
  home: '/home',
  practice: '/practice',
  interviews: '/interviews',
  interviewSetup: '/interview/setup',
  resume: '/resume',
  progress: '/progress',
  profile: '/profile',
};

export const interviewRoomPath = (id) => `/interview/${id}`;
export const reportPath = (id) => `/report/${id}`;
export const resumeAnalysisPath = (id) => `/resume/${id}`;

// Primary tab bar — rendered centered in the top navigation.
export const NAV_TABS = [
  { label: 'Home', to: ROUTES.home },
  { label: 'Practice', to: ROUTES.practice },
  { label: 'Interviews', to: ROUTES.interviews },
  { label: 'Resume', to: ROUTES.resume },
  { label: 'Progress', to: ROUTES.progress },
];

// Catalog-backed roles (RoleSkillCatalog.role — docs/05 §targetRole invariant).
// The profile UI presents exactly these; there is no free-text role entry.
export const TARGET_ROLES = ['Backend Developer', 'Frontend Developer', 'Full Stack Developer'];

export const EXPERIENCE_LEVELS = ['Student', 'Entry', 'Junior'];

export const DIFFICULTIES = ['Easy', 'Medium', 'Hard'];

export const QUESTION_COUNTS = [3, 4, 5];

// Backend failureReason codes (resume model + M6 tests) → human labels.
export const FAILURE_REASON_LABELS = {
  RESUME_TEXT_EXTRACTION_FAILED: 'We could not read text from this file. Try a different PDF or DOCX.',
  AI_PROVIDER_FAILED: 'The analysis service was unavailable. Please try again later.',
  SCHEMA_VALIDATION_FAILED: 'The analysis produced an invalid result. Please try again.',
};
