// Mock data store — drives the UI without a running backend.
// Shapes mirror the verified backend contracts (docs/18–20) exactly:
// no invented scores, no fake fields. Replace with real API calls in M7 wiring.

const now = Date.now();
const daysAgo = (n) => new Date(now - n * 24 * 60 * 60 * 1000).toISOString();

export const DEMO_USER = {
  _id: '65f0a1b2c3d4e5f6a7b8c9d0',
  firstName: 'Ava',
  lastName: 'Chen',
  email: 'ava.chen@example.com',
};

// ---------------------------------------------------------------- interviews

export const QUESTION_POOL = [
  {
    text: 'Tell me about a time when you disagreed with a teammate. How did you handle it?',
    category: 'Behavioral',
    expectedTopics: [{ skillKey: 'communication', topic: 'Conflict resolution' }],
  },
  {
    text: 'Walk me through a project you are proud of. What was your specific contribution?',
    category: 'Behavioral',
    expectedTopics: [{ skillKey: 'communication', topic: 'Ownership' }],
  },
  {
    text: 'How would you design a URL shortener that handles millions of redirects per day?',
    category: 'Technical',
    expectedTopics: [
      { skillKey: 'system-design', topic: 'Scalability' },
      { skillKey: 'rest-apis', topic: 'API design' },
    ],
  },
  {
    text: 'Explain how you would model a many-to-many relationship in MongoDB, and when you would embed instead.',
    category: 'Technical',
    expectedTopics: [
      { skillKey: 'mongodb', topic: 'Schema design' },
      { skillKey: 'nosql', topic: 'Data modeling' },
    ],
  },
  {
    text: 'Describe your approach to designing a REST API that other teams will build on for years.',
    category: 'Technical',
    expectedTopics: [
      { skillKey: 'rest-apis', topic: 'Versioning' },
      { skillKey: 'nodejs', topic: 'Service structure' },
    ],
  },
  {
    text: 'Tell me about the most difficult bug you have debugged. What made it hard?',
    category: 'Situational',
    expectedTopics: [{ skillKey: 'javascript', topic: 'Debugging methodology' }],
  },
];

export function pickQuestions(count) {
  return QUESTION_POOL.slice(0, Math.max(3, Math.min(5, count)));
}

// Deterministic pseudo-random from a string seed, so scores never jump between renders.
function seededUnit(seed) {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 1000) / 1000;
}

const clampScore = (n) => Math.max(0, Math.min(100, Math.round(n)));

// Mirrors the backend evaluation semantics (docs/20 §3): blank answers score 0
// with no AI call; report aggregation uses the documented weights.
export function evaluateAnswer(question, text, index) {
  const blank = !text || !text.trim();
  if (blank) {
    return {
      correctness: 0,
      technicalDepth: 0,
      communication: 0,
      strengths: [],
      weaknesses: ['No response provided'],
    };
  }
  const unit = seededUnit(`${question._id}:${text.length}`);
  const base = 55 + unit * 35;
  const jitter = (offset) => clampScore(base + offset * 12 - index * 1.5);
  const correctness = jitter(0.2);
  const technicalDepth = jitter(-0.4);
  const communication = jitter(0.9);

  const strengths = [];
  const weaknesses = [];
  if (communication >= 70) strengths.push('Clear, structured explanation');
  else weaknesses.push('Structure the answer around a concrete example');
  if (technicalDepth >= 70) strengths.push('Solid technical depth');
  else weaknesses.push('Go deeper on trade-offs and reasoning');
  if (text.trim().split(/\s+/).length > 45) strengths.push('Good level of detail');
  else weaknesses.push('Add measurable outcomes where possible');

  return { correctness, technicalDepth, communication, strengths, weaknesses };
}

// Report shape per docs/20 §5 — overallScore is weighted
// (0.50 corr + 0.30 depth + 0.20 comm); technicalScore is 0.60 corr + 0.40 depth.
export function buildReport(interview) {
  const evaluations = interview.questions.map((question, index) => {
    const answer = interview.answers.find((entry) => entry.questionId === question._id);
    return { question, evaluation: evaluateAnswer(question, answer?.text, index) };
  });

  const avg = (values) =>
    values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;

  const correctness = avg(evaluations.map(({ evaluation }) => evaluation.correctness));
  const depth = avg(evaluations.map(({ evaluation }) => evaluation.technicalDepth));
  const communication = avg(evaluations.map(({ evaluation }) => evaluation.communication));

  const answered = evaluations.filter(
    ({ evaluation }) => evaluation.correctness > 0 || evaluation.communication > 0,
  );

  const strengths = [...new Set(answered.flatMap(({ evaluation }) => evaluation.strengths))].slice(0, 5);
  const weaknesses = [...new Set(evaluations.flatMap(({ evaluation }) => evaluation.weaknesses))].slice(0, 5);

  const recommendations = [
    ...new Set([
      ...(weaknesses[0] ? [`Focus next on: ${weaknesses[0].toLowerCase()}`] : []),
      'Run one focused practice session before your next interview',
    ]),
  ];

  return {
    overallScore: correctness != null && communication != null
      ? Math.round(correctness * 0.5 + depth * 0.3 + communication * 0.2)
      : null,
    technicalScore: correctness != null ? Math.round(correctness * 0.6 + depth * 0.4) : null,
    communicationScore: communication,
    strengths,
    weaknesses,
    recommendations,
    questionResults: evaluations.map(({ question, evaluation }) => ({
      text: question.text,
      technicalScore: Math.round(evaluation.correctness * 0.6 + evaluation.technicalDepth * 0.4),
      communicationScore: evaluation.communication,
      strengths: evaluation.strengths,
      weaknesses: evaluation.weaknesses,
    })),
    profileSyncStatus: 'PENDING',
    generatedAt: new Date().toISOString(),
  };
}

export function makeQuestionRecords(count, difficulty) {
  return pickQuestions(count).map((question, index) => ({
    _id: `q${index + 1}${Math.random().toString(16).slice(2, 8)}`,
    text: question.text,
    category: question.category,
    difficulty,
    expectedTopics: question.expectedTopics,
  }));
}

function seedCompleted(id, targetRole, difficulty, ageDays, answersText) {
  const questions = makeQuestionRecords(answersText.length, difficulty);
  const interview = {
    _id: id,
    userId: DEMO_USER._id,
    targetRole,
    difficulty,
    status: 'COMPLETED',
    questionGeneration: { status: 'COMPLETED' },
    questions,
    answers: questions.map((question, index) => ({
      _id: `${id}-a${index}`,
      questionId: question._id,
      text: answersText[index],
      evaluationStatus: 'COMPLETED',
    })),
    startedAt: daysAgo(ageDays),
    completedAt: daysAgo(ageDays),
    createdAt: daysAgo(ageDays),
  };
  interview.report = buildReport(interview);
  return interview;
}

const solidAnswer =
  'In my last project we disagreed on caching strategy. I prepared benchmarks for both options, walked the team through the numbers, and we agreed on a hybrid approach. Redirect latency dropped by roughly 40% and the team kept a shared decision log afterwards.';
const thinAnswer =
  'We had a disagreement but we talked it through and picked the simpler option. It worked out fine in the end and we shipped on time.';

export const SEEDED_INTERVIEWS = [
  seedCompleted('65f1aaaaaaaaaaaaaaaaaaaa', 'Backend Developer', 'Medium', 12, [solidAnswer, thinAnswer, solidAnswer, solidAnswer]),
  seedCompleted('65f2bbbbbbbbbbbbbbbbbbbb', 'Full Stack Developer', 'Easy', 7, [solidAnswer, solidAnswer, thinAnswer]),
  {
    _id: '65f3cccccccccccccccccccc',
    userId: DEMO_USER._id,
    targetRole: 'Frontend Developer',
    difficulty: 'Medium',
    status: 'IN_PROGRESS',
    questionGeneration: { status: 'COMPLETED' },
    questions: makeQuestionRecords(4, 'Medium'),
    answers: [],
    startedAt: daysAgo(1),
    createdAt: daysAgo(1),
  },
  {
    _id: '65f4dddddddddddddddddddd',
    userId: DEMO_USER._id,
    targetRole: 'Backend Developer',
    difficulty: 'Hard',
    status: 'CREATED',
    questionGeneration: { status: 'COMPLETED' },
    questions: makeQuestionRecords(3, 'Hard'),
    answers: [],
    createdAt: daysAgo(2),
  },
];

// ------------------------------------------------------------------ resumes

export const SEEDED_RESUMES = [
  {
    _id: '65f5eeeeeeeeeeeeeeeeeeee',
    originalFilename: 'ava-chen-resume.pdf',
    mimeType: 'application/pdf',
    size: 184320,
    status: 'ANALYZED',
    failureReason: null,
    createdAt: daysAgo(6),
    analysis: {
      extractedSkills: ['JavaScript', 'TypeScript', 'React', 'Node.js', 'MongoDB', 'REST APIs'],
      experienceSummary:
        'Around three years of full-stack work, most recently owning the web client of a logistics platform. Experience spans feature delivery through production support, with growing responsibility for API design.',
      projects: [
        {
          name: 'Freight tracking dashboard',
          description:
            'Real-time shipment dashboard with live map updates, role-based access, and an audit trail. Led migration from REST polling to websocket updates.',
          technologies: ['React', 'Node.js', 'MongoDB'],
        },
        {
          name: 'Internal design system',
          description:
            'Component library adopted by four product teams, with visual regression checks in CI.',
          technologies: ['TypeScript', 'Storybook'],
        },
      ],
      strengths: [
        'Concrete, quantified impact statements',
        'Clear progression of ownership across roles',
        'Consistent technology story across projects',
      ],
      skillGaps: ['System Design', 'Automated Testing', 'Cloud Infrastructure'],
    },
  },
  {
    _id: '65f6ffffffffffffffffffff',
    originalFilename: 'portfolio-v2.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    size: 96256,
    status: 'FAILED',
    failureReason: 'AI_PROVIDER_FAILED',
    createdAt: daysAgo(3),
    analysis: null,
  },
];

// ---------------------------------------------------------------- analytics

// GET /analytics/readiness shape — breakdown is a named object (not an
// array), each component 0–100 or null; neutral priors reported as 50.
// Values mirror the demo state: 2 completed interviews (consistency still at
// its neutral prior), skill coverage computed from mockSkillProfile() against
// the seeded Backend Developer catalog: covered weight 2.9 / total 5.7 ≈ 50.9;
// score re-normalizes weights over the active components only:
// (0.35·68 + 0.20·79 + 0.25·50.9 + 0.10·58) / 0.90 ≈ 64.6.
export const MOCK_READINESS = {
  score: 64.6,
  breakdown: {
    technical: 68,
    communication: 79,
    skillCoverage: 50.9,
    consistency: 50,
    improvementTrend: 58,
  },
  interviewCount: 2,
};

// GET /analytics/practice-plan shape — items carry canonical skillKeys plus
// reason ∈ 'missing' | 'unassessed' | 'under-level'; no prose, no display
// names (the backend never sends those — pages own presentation mapping).
// Gaps mirror mockSkillProfile() checked against the seeded Backend
// Developer catalog (server/scripts/seedRoleSkillCatalog.js), in catalog order.
export const MOCK_PRACTICE_PLAN = {
  targetRole: 'Backend Developer',
  skillGaps: [
    {
      skillKey: 'sql',
      requiredMinimumLevel: 'INTERMEDIATE',
      currentLevel: null,
      reason: 'missing',
    },
    {
      skillKey: 'nosql',
      requiredMinimumLevel: 'BEGINNER',
      currentLevel: null,
      reason: 'missing',
    },
    {
      skillKey: 'system-design',
      requiredMinimumLevel: 'BEGINNER',
      currentLevel: null,
      reason: 'unassessed',
    },
    {
      skillKey: 'testing',
      requiredMinimumLevel: 'BEGINNER',
      currentLevel: null,
      reason: 'missing',
    },
  ],
};

export function mockProfile() {
  return { targetRole: 'Backend Developer', experienceLevel: 'Junior' };
}

export function mockSkillProfile() {
  return {
    skills: [
      { skillKey: 'javascript', level: 'ADVANCED', assessed: true },
      { skillKey: 'nodejs', level: 'INTERMEDIATE', assessed: true },
      { skillKey: 'rest-apis', level: 'INTERMEDIATE', assessed: true },
      { skillKey: 'mongodb', level: 'BEGINNER', assessed: true },
      { skillKey: 'system-design', level: null, assessed: false },
    ],
    updatedAt: daysAgo(1),
  };
}
