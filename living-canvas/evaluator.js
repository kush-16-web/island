'use strict';

/**
 * Living Canvas — Quality Evaluation Checklist & Rubric (Pass 2)
 * 
 * Criteria:
 * 1. Recognizable Main Subject: Is the primary figure or object identifiable rather than an ambiguous blob?
 * 2. Communicated Central Metaphor: Does the imagery visually translate the song's symbolic meaning?
 * 3. Emotional Resonance: Does the color, tone, and posture evoke the song's mood?
 * 4. Expressive Linework: Is the line organic and deliberate rather than random, disconnected scribbles?
 * 5. Distinctive Composition: Does this song have a unique spatial layout instead of a generic center-stamp?
 */

const QUALITY_CRITERIA = [
  {
    id: 'subject_recognition',
    title: 'Recognizable Main Subject',
    description: 'The primary visual figure/form is clearly legible and identifiable, not an ambiguous abstract tangle.',
    weight: 20,
  },
  {
    id: 'metaphor_communication',
    title: 'Communicated Central Metaphor',
    description: 'The central visual metaphor (e.g. roots becoming a guitar, descending tear turning into water ripples) is visually depicted.',
    weight: 25,
  },
  {
    id: 'emotional_resonance',
    title: 'Song Emotional Alignment',
    description: 'Color temperature, contrast, and posture evoke the emotional narrative of the track.',
    weight: 20,
  },
  {
    id: 'expressive_linework',
    title: 'Deliberate & Expressive Linework',
    description: 'Continuous contour line demonstrates organic weight variation, fluid curves, and intentional pathing.',
    weight: 20,
  },
  {
    id: 'compositional_distinctiveness',
    title: 'Distinctive Composition & Space',
    description: 'Intentional negative space (>50%) and asymmetrical staging ensure the poster is distinct from other songs.',
    weight: 15,
  },
];

/**
 * Evaluates concept and prompt readiness against the 5 quality criteria.
 * 
 * @param {object} concept - Interpreted concept JSON
 * @param {object} prompts - Generated prompts { positivePrompt, negativePrompt }
 * @returns {object} Evaluation results and checklist report
 */
function evaluateConceptQuality(concept, prompts) {
  const scores = {};
  const feedback = [];

  // 1. Subject Recognition Check
  const subject = concept.main_visual_subject || '';
  const hasConcreteSubject = /\b(figure|person|hands?|guitar|umbrella|tree|wings?|bird|crane|face|silhouette|flower|roots?)\b/i.test(subject);
  const subjectScore = hasConcreteSubject && subject.length > 25 ? 20 : 12;
  scores.subject_recognition = subjectScore;
  if (!hasConcreteSubject) {
    feedback.push('Subject description is overly abstract; anchor with concrete physical nouns.');
  }

  // 2. Metaphor Communication Check
  const metaphor = concept.central_metaphor || '';
  const hasMetaphor = metaphor.length > 30 && (metaphor.includes('into') || metaphor.includes('turning') || metaphor.includes('becoming') || metaphor.includes('weaving') || metaphor.includes('dissolving'));
  const metaphorScore = hasMetaphor ? 25 : 15;
  scores.metaphor_communication = metaphorScore;
  if (!hasMetaphor) {
    feedback.push('Central metaphor needs a clearer physical transformation (e.g. X dissolving into Y).');
  }

  // 3. Emotional Resonance Check
  const theme = concept.emotional_theme || '';
  const palette = concept.color_palette || {};
  const hasPalette = Boolean(palette.background && palette.line_color && palette.accent_color);
  const emotionScore = theme.length > 20 && hasPalette ? 20 : 10;
  scores.emotional_resonance = emotionScore;

  // 4. Linework Expressiveness Check
  const lineInstructions = concept.continuous_line_instructions || '';
  const hasLineDetails = lineInstructions.length > 40 && /\b(unbroken|continuous|fluid|stroke|curve|loops?)\b/i.test(lineInstructions);
  const lineworkScore = hasLineDetails ? 20 : 12;
  scores.expressive_linework = lineworkScore;

  // 5. Compositional Distinctiveness Check
  const comp = concept.composition || '';
  const hasSpace = comp.includes('%') || /\b(negative space|asymmetrical|off-center|third|diagonal)\b/i.test(comp);
  const compScore = hasSpace ? 15 : 8;
  scores.compositional_distinctiveness = compScore;

  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);

  return {
    totalScore,
    maxScore: 100,
    passed: totalScore >= 75,
    criteria: QUALITY_CRITERIA.map((c) => ({
      ...c,
      score: scores[c.id] || 0,
      passed: (scores[c.id] || 0) >= c.weight * 0.7,
    })),
    feedback,
  };
}

module.exports = {
  QUALITY_CRITERIA,
  evaluateConceptQuality,
};
