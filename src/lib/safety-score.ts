/**
 * Pure scoring model + scorer for the « Sécurité foncière » self-diagnostic.
 *
 * Extracted out of SafetyTool.tsx so the deterministic risk math can be
 * unit-tested in isolation. The component keeps the icons + i18n rendering and
 * imports this module. NO i18n, NO React here — pure data + a pure function.
 *
 * Risk weights encode real Senegalese land-fraud patterns (vente multiple,
 * coxeur sans mandat, papier simple vs titre foncier, prix anormalement bas…).
 * 0 = reassuring, 1 = minor caution, 2 = caution, 3 = red flag.
 */

export const SAFETY_QUESTIONS = [
  {
    id: 'doc',
    options: [
      { key: 'tf', risk: 0 },
      { key: 'bail', risk: 1 },
      { key: 'delib', risk: 2 },
      { key: 'papier', risk: 3 },
      { key: 'aucun', risk: 3 },
    ],
  },
  {
    id: 'original',
    options: [
      { key: 'oui', risk: 0 },
      { key: 'copie', risk: 2 },
      { key: 'non', risk: 3 },
    ],
  },
  {
    id: 'vendeur',
    options: [
      { key: 'verifie', risk: 0 },
      { key: 'pas', risk: 2 },
      { key: 'different', risk: 3 },
    ],
  },
  {
    id: 'interlocuteur',
    options: [
      { key: 'proprio', risk: 0 },
      { key: 'mandataire', risk: 1 },
      { key: 'coxeur', risk: 3 },
    ],
  },
  {
    id: 'prix',
    options: [
      { key: 'marche', risk: 0 },
      { key: 'bas', risk: 1 },
      { key: 'tropbas', risk: 3 },
    ],
  },
  {
    id: 'visite',
    options: [
      { key: 'bornage', risk: 0 },
      { key: 'visite', risk: 1 },
      { key: 'non', risk: 2 },
    ],
  },
] as const;

export type SafetyQuestionId = (typeof SAFETY_QUESTIONS)[number]['id'];
export type SafetyAnswers = Partial<Record<SafetyQuestionId, string>>;
export type RiskLevel = 'vert' | 'orange' | 'rouge';

export const SAFETY_TOTAL_STEPS = SAFETY_QUESTIONS.length; // always 6

export interface AnsweredOption {
  qid: SafetyQuestionId;
  optKey: string;
  risk: number;
}

export interface SafetyResult {
  level: RiskLevel;
  sum: number;
  dangerCount: number;
  /** answered questions, in question order */
  answered: AnsweredOption[];
  /** answered options with risk > 0 (the points de vigilance), in question order */
  flags: AnsweredOption[];
}

/**
 * DETERMINISTIC scoring. sum = Σ option weights; dangerCount = number of
 * red-flag (weight-3) answers. Two or more red flags, OR a high cumulative
 * score → rouge; one red flag OR a moderate score → orange; otherwise vert.
 * Pure function of the answers — no server, no randomness, no invented number.
 */
export function scoreSafety(answers: SafetyAnswers): SafetyResult {
  let sum = 0;
  let dangerCount = 0;
  const answered: AnsweredOption[] = [];
  const flags: AnsweredOption[] = [];
  for (const q of SAFETY_QUESTIONS) {
    const optKey = answers[q.id];
    if (!optKey) continue;
    const opt = q.options.find((o) => o.key === optKey);
    if (!opt) continue;
    sum += opt.risk;
    if (opt.risk === 3) dangerCount += 1;
    const entry: AnsweredOption = { qid: q.id, optKey: opt.key, risk: opt.risk };
    answered.push(entry);
    if (opt.risk > 0) flags.push(entry);
  }
  const level: RiskLevel =
    dangerCount >= 2 || sum >= 9 ? 'rouge' : dangerCount >= 1 || sum >= 4 ? 'orange' : 'vert';
  return { level, sum, dangerCount, answered, flags };
}
