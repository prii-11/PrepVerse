// Resume Analysis structured output — docs/07 §2, exact contract. Reused by
// the orchestrator (schema validation + post-validation sanitization) and by
// the future ResumeAnalyzer (M5.2). No new response fields are invented:
// anything Gemini returns beyond this shape is stripped by Zod's default
// object handling (unknown keys dropped).
//
// Validation vs. sanitization split (M5.1 §10-§11, authoritative ordering):
// - The SCHEMA enforces shape, presence, and hard structural rules that FAIL
//   (wrong type, missing field, empty string where non-empty is required).
// - Length caps ("max 30 items", "max 500 chars") are enforced by the
//   sanitize step AFTER validation, per docs/07 §1's pipeline ("arrays capped
//   at max length, strings truncated") — the schema deliberately does not cap
//   them, otherwise sanitization would be dead code.
const { z } = require('zod');

const projectSchema = z.object({
  name: z.string().min(1, 'project name must be non-empty'),
  description: z.string(),
  technologies: z.array(z.string()),
});

const resumeAnalysisSchema = z.object({
  extractedSkills: z.array(z.string()), // field must be present; empty allowed (docs/07 §2)
  experienceSummary: z.string().min(1, 'experienceSummary must be non-empty'),
  projects: z.array(projectSchema), // field must be present; empty allowed
  strengths: z.array(z.string()),
  skillGaps: z.array(z.string()),
});

// Docs/07 §2 caps. Applied only after schema validation succeeds (M5.1 §11).
function truncate(value, max) {
  return value.length > max ? value.slice(0, max) : value;
}
function cap(value, max) {
  return value.length > max ? value.slice(0, max) : value;
}

function sanitizeResumeAnalysis(output) {
  return {
    ...output,
    experienceSummary: truncate(output.experienceSummary, 500),
    extractedSkills: cap(output.extractedSkills, 30),
    projects: cap(output.projects, 10),
    strengths: cap(output.strengths, 8),
    skillGaps: cap(output.skillGaps, 15),
  };
}

module.exports = { resumeAnalysisSchema, sanitizeResumeAnalysis };
