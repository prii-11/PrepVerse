// scripts/seedRoleSkillCatalog.js — manual one-off seed for the
// RoleSkillCatalog collection (docs/05 §5). Run manually, NOT on server boot:
//
//   node scripts/seedRoleSkillCatalog.js          (needs MONGO_URI in env/.env)
//
// PLACEHOLDER seed data — a reasonable starting set, NOT a final curated
// catalog. The catalog is human-curated, never AI-written, in MVP (docs/05 §5).
// Skill keys are canonical lowercase keys (AGENTS.md rule #5).
require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const RoleSkillCatalog = require('../src/modules/analytics/roleSkillCatalog.model');

if (!process.env.MONGO_URI) {
  console.error('Missing MONGO_URI. Set it in server/.env or the environment before running the seed.');
  process.exit(1);
}

const PLACEHOLDER_CATALOG = [
  {
    role: 'Backend Developer',
    requiredSkills: [
      { skillKey: 'javascript', weight: 1.0, minimumLevel: 'INTERMEDIATE' },
      { skillKey: 'nodejs', weight: 1.0, minimumLevel: 'INTERMEDIATE' },
      { skillKey: 'sql', weight: 0.9, minimumLevel: 'INTERMEDIATE' },
      { skillKey: 'rest-apis', weight: 0.9, minimumLevel: 'INTERMEDIATE' },
      { skillKey: 'nosql', weight: 0.7, minimumLevel: 'BEGINNER' },
      { skillKey: 'system-design', weight: 0.7, minimumLevel: 'BEGINNER' },
      { skillKey: 'testing', weight: 0.5, minimumLevel: 'BEGINNER' },
    ],
  },
  {
    role: 'Frontend Developer',
    requiredSkills: [
      { skillKey: 'html-css', weight: 1.0, minimumLevel: 'INTERMEDIATE' },
      { skillKey: 'javascript', weight: 1.0, minimumLevel: 'INTERMEDIATE' },
      { skillKey: 'typescript', weight: 0.8, minimumLevel: 'BEGINNER' },
      { skillKey: 'react', weight: 1.0, minimumLevel: 'INTERMEDIATE' },
      { skillKey: 'css-frameworks', weight: 0.6, minimumLevel: 'BEGINNER' },
      { skillKey: 'web-performance', weight: 0.5, minimumLevel: 'BEGINNER' },
    ],
  },
  {
    role: 'Full-Stack Developer',
    requiredSkills: [
      { skillKey: 'javascript', weight: 1.0, minimumLevel: 'INTERMEDIATE' },
      { skillKey: 'nodejs', weight: 0.9, minimumLevel: 'INTERMEDIATE' },
      { skillKey: 'react', weight: 0.9, minimumLevel: 'INTERMEDIATE' },
      { skillKey: 'rest-apis', weight: 0.9, minimumLevel: 'INTERMEDIATE' },
      { skillKey: 'sql', weight: 0.8, minimumLevel: 'INTERMEDIATE' },
      { skillKey: 'nosql', weight: 0.7, minimumLevel: 'BEGINNER' },
      { skillKey: 'html-css', weight: 0.7, minimumLevel: 'BEGINNER' },
    ],
  },
  {
    role: 'Data Scientist/ML Engineer',
    requiredSkills: [
      { skillKey: 'python', weight: 1.0, minimumLevel: 'ADVANCED' },
      { skillKey: 'statistics', weight: 1.0, minimumLevel: 'INTERMEDIATE' },
      { skillKey: 'machine-learning', weight: 1.0, minimumLevel: 'INTERMEDIATE' },
      { skillKey: 'pandas', weight: 0.8, minimumLevel: 'INTERMEDIATE' },
      { skillKey: 'data-visualization', weight: 0.6, minimumLevel: 'BEGINNER' },
      { skillKey: 'sql', weight: 0.7, minimumLevel: 'BEGINNER' },
    ],
  },
];

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);

  const now = new Date();
  for (const entry of PLACEHOLDER_CATALOG) {
    const res = await RoleSkillCatalog.updateOne(
      { role: entry.role },
      { $set: { requiredSkills: entry.requiredSkills, updatedAt: now } },
      { upsert: true }
    );
    console.log(`${entry.role}: upserted=${res.upsertedCount || 0} modified=${res.modifiedCount || 0}`);
  }

  const total = await RoleSkillCatalog.countDocuments();
  console.log(`RoleSkillCatalog total documents: ${total}`);
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
