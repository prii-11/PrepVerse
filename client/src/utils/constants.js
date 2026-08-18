// Shared application constants used across the frontend.
export const APP_NAME = 'AI Mock Interview Ecosystem';

export const ROUTES = {
  login: '/login',
  signup: '/signup',
  profile: '/profile',
  dashboard: '/dashboard',
  resumeUpload: '/resume/upload',
  resumeAnalysis: '/resume/analysis',
  interviewSetup: '/interview/setup',
  interviewScreen: '/interview/screen',
  interviewReport: '/report',
  practicePlan: '/practice',
  progress: '/progress',
};

// Backend failureReason codes (resume model + M6 tests) → human labels.
export const FAILURE_REASON_LABELS = {
  RESUME_TEXT_EXTRACTION_FAILED: 'We could not read text from this file. Try a different PDF or DOCX.',
  AI_PROVIDER_FAILED: 'The analysis service was unavailable. Please try again later.',
  SCHEMA_VALIDATION_FAILED: 'The analysis produced an invalid result. Please try again.',
};