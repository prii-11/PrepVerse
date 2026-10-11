// QuestionGenerator — M5.3: wraps orchestrator.run('QUESTION_GENERATION', ...)
// per docs/07 §3 exact contract. No persistence, no HTTP, no MongoDB writes.
// Returns the validated questions array plus provenance to its caller
// (InterviewService, which owns persistence).

const { run, OPERATION_REGISTRY } = require('./orchestrator');

// System instruction — docs/07 §3, verbatim. {targetRole}/{difficulty} are
// filled at build time: the instruction text itself references both.
const SYSTEM_INSTRUCTION = `You generate technical interview questions for a candidate preparing for {targetRole} at {difficulty} difficulty. Use the candidate's skill profile and past weaknesses to personalize question selection — favor areas listed in skillGaps or previousWeaknesses when relevant to the role, without making the interview unfairly narrow. Do not repeat conceptually identical questions. Respond with JSON only, matching the schema exactly.`;

// Schema description from the operation registry — the single source of truth
// for the question-generation contract shape. Used in the first-attempt prompt
// so Gemini receives clear structured-output guidance without relying on the
// correction retry.
const SCHEMA_DESCRIPTION = OPERATION_REGISTRY.QUESTION_GENERATION.schemaDescription;

// User content template — docs/07 §3, verbatim. Array fields are serialized as
// JSON so the model sees unambiguous structured values.
function buildUserContent({ targetRole, difficulty, currentSkillProfile, previousWeaknesses, questionCount }) {
  const skills = Array.isArray(currentSkillProfile?.skills) ? currentSkillProfile.skills : [];
  const skillGaps = Array.isArray(currentSkillProfile?.skillGaps) ? currentSkillProfile.skillGaps : [];
  const weakAreas = Array.isArray(previousWeaknesses) ? previousWeaknesses : [];
  return `Target role: ${targetRole}
Difficulty: ${difficulty}
Candidate skills: ${JSON.stringify(skills)}
Candidate skill gaps: ${JSON.stringify(skillGaps)}
Previous weak areas: ${JSON.stringify(weakAreas)}
Number of questions: ${questionCount}

Return a JSON object with this exact shape:
${SCHEMA_DESCRIPTION}`;
}

// Builds the full prompt (system instruction with role/difficulty filled in +
// user content) for the orchestrator.
function buildPrompt({ targetRole, difficulty, currentSkillProfile, previousWeaknesses, questionCount }) {
  const systemInstruction = SYSTEM_INSTRUCTION.replace('{targetRole}', targetRole).replace('{difficulty}', difficulty);
  const userContent = buildUserContent({ targetRole, difficulty, currentSkillProfile, previousWeaknesses, questionCount });
  return `${systemInstruction}\n\n${userContent}`;
}

/**
 * Generate interview questions via the AI Orchestrator.
 *
 * @param {Object} params
 * @param {string} params.targetRole - Must already be catalog-validated (service layer)
 * @param {'easy'|'medium'|'hard'} params.difficulty
 * @param {Object} params.currentSkillProfile - { skills: [...], skillGaps: [...] } from User
 * @param {string[]} params.previousWeaknesses - From past COMPLETED interview reports ([] if none)
 * @param {number} params.questionCount - 3-5, MVP default 4
 * @param {string} params.userId - User ID for AIExecution logging
 * @param {ObjectId} params.interviewId - The created Interview._id for AIExecution entityId
 * @returns {Promise<Object>} { questions, promptVersion, model } — validated per docs/07 §3
 * @throws {AIProviderError} If orchestrator exhausts retries (propagated)
 */
async function generateQuestions({
  targetRole,
  difficulty,
  currentSkillProfile,
  previousWeaknesses,
  questionCount,
  userId,
  interviewId,
}) {
  const prompt = buildPrompt({ targetRole, difficulty, currentSkillProfile, previousWeaknesses, questionCount });

  // The orchestrator owns: provider selection, retry/backoff, JSON extraction,
  // schema validation, correction retry, sanitization, AIExecution logging.
  // QuestionGenerator provides the payload and returns the validated result.
  const { result, execution } = await run('QUESTION_GENERATION', {
    userId,
    // A real Interview exists before the AI call, so entityId is the
    // Interview._id — unlike M5.2's ResumeAnalysis where no entity existed yet.
    entityId: interviewId,
    prompt,
    input: { targetRole, difficulty, currentSkillProfile, previousWeaknesses, questionCount },
  });

  // Add provenance fields to the result (matching Interview.questionGeneration
  // shape from docs/05 §4). Persistence is the caller's job.
  return {
    questions: result.questions,
    promptVersion: execution.promptVersion,
    model: execution.model,
  };
}

module.exports = { generateQuestions, SYSTEM_INSTRUCTION, buildUserContent, buildPrompt, SCHEMA_DESCRIPTION };