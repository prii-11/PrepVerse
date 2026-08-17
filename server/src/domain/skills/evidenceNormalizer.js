// EvidenceNormalizer — the "skill → interview" backend normalization layer
// (docs/08 §1 status: locked rule: `topic → skill` = AnswerEvaluator,
// `skill → interview` = backend normalization, `interview → profile` =
// SkillProfileService). One responsibility, no persistence, no mongoose, no
// AI: pure deterministic mapping of answers[].evaluation.topicAssessments into
// pre-normalized skill evidence events for SkillProfileService.
//
// Map (docs/08 §2): Gemini returns qualitative topicAssessments[].quality
// only. The backend performs this deterministic mapping AFTER schema
// validation: missing → 0, weak → 1, good → 2, strong → 3. Within one
// interview, all addressed assessments for the same skillKey are aggregated
// into ONE evidence event; the signal is the average of the mapped values
// where addressed === true.
//
// Hard invariants (docs/08 §2):
//   - Zero addressed-true assessments for a skill → NO evidence event for it.
//     Silence is not negative evidence — never synthesize signal = 0 for an
//     empty set. (M5.4 blank answers write addressed:false, so they must
//     produce nothing here.)
//   - addressed:true + quality:'missing' IS negative evidence: it contributes
//     0 to the average AND flags the skill as a potentialGap.
//
// Output shape (docs/05 §7): events [{ skillKey, signal, answerIds }] —
// SkillProfileService stamps interviewId/assessedAt and never re-reads raw
// topicAssessments (downstream layers never reinterpret upstream output).

// docs/08 §2: the qualitative → numeric mapping, applied only to
// addressed:true assessments.
const QUALITY_SIGNAL = { missing: 0, weak: 1, good: 2, strong: 3 };

function signalForQuality(quality) {
  return QUALITY_SIGNAL[quality] ?? null;
}

// Aggregates one interview's completed answers into evidence events.
// `answers` entries are the Interview.answers subdocuments; each must carry
// evaluationStatus, _id, and (when COMPLETED) evaluation.topicAssessments.
function normalizeInterviewEvidence({ answers }) {
  const groups = new Map(); // skillKey → { signals, answerIds, hasMissing, hasPositive }

  for (const answer of answers ?? []) {
    if (answer.evaluationStatus !== 'COMPLETED' || !answer.evaluation) continue;
    const assessmentBlocks = answer.evaluation.topicAssessments;
    if (!Array.isArray(assessmentBlocks)) continue;

    for (const assessment of assessmentBlocks) {
      // addressed:false contributes NO skill evidence downstream (docs/08 §2,
      // M5.4 contract) — skipped here entirely, never a gap flag either.
      if (assessment.addressed !== true) continue;
      const signal = signalForQuality(assessment.quality);
      if (signal == null) continue;

      let group = groups.get(assessment.skillKey);
      if (!group) {
        group = { signals: [], answerIds: [], hasMissing: false, hasPositive: false };
        groups.set(assessment.skillKey, group);
      }
      group.signals.push(signal);
      if (!group.answerIds.includes(String(answer._id))) {
        group.answerIds.push(String(answer._id));
      }
      if (assessment.quality === 'missing') group.hasMissing = true;
      else group.hasPositive = true;
    }
  }

  const events = [];
  const potentialGaps = [];
  for (const [skillKey, group] of groups) {
    events.push({
      skillKey,
      signal: average(group.signals),
      answerIds: group.answerIds,
    });
    // potentialGap (M5.5): the skill was assessed this interview but its only
    // addressed signal was 'missing' — the one "at risk" neighborhood. A skill
    // with any weak-or-better addressed signal is not flagged.
    if (group.hasMissing && !group.hasPositive) {
      potentialGaps.push(skillKey);
    }
  }

  return { events, potentialGaps };
}

function average(values) {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

module.exports = { normalizeInterviewEvidence, QUALITY_SIGNAL };