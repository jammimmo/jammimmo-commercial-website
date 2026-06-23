import { describe, it, expect } from 'vitest';
import { scoreSafety, SAFETY_QUESTIONS, SAFETY_TOTAL_STEPS, type SafetyAnswers } from './safety-score';

const allReassuring: SafetyAnswers = {
  doc: 'tf',
  original: 'oui',
  vendeur: 'verifie',
  interlocuteur: 'proprio',
  prix: 'marche',
  visite: 'bornage',
};

describe('scoreSafety', () => {
  it('has six questions', () => {
    expect(SAFETY_TOTAL_STEPS).toBe(6);
    expect(SAFETY_QUESTIONS).toHaveLength(6);
  });

  it('all-reassuring answers → vert, sum 0, no flags', () => {
    const r = scoreSafety(allReassuring);
    expect(r.level).toBe('vert');
    expect(r.sum).toBe(0);
    expect(r.dangerCount).toBe(0);
    expect(r.flags).toHaveLength(0);
    expect(r.answered).toHaveLength(6);
  });

  it('a single red flag → orange', () => {
    const r = scoreSafety({ doc: 'papier' }); // risk 3
    expect(r.dangerCount).toBe(1);
    expect(r.sum).toBe(3);
    expect(r.level).toBe('orange');
    expect(r.flags).toHaveLength(1);
    expect(r.flags[0]).toMatchObject({ qid: 'doc', optKey: 'papier', risk: 3 });
  });

  it('two red flags → rouge', () => {
    const r = scoreSafety({ doc: 'papier', original: 'non' });
    expect(r.dangerCount).toBe(2);
    expect(r.level).toBe('rouge');
  });

  it('high cumulative score (>=9) without two reds → rouge', () => {
    // delib(2) + copie(2) + pas(2) + non(2) + bas(1) = 9, zero weight-3 answers
    const r = scoreSafety({
      doc: 'delib',
      original: 'copie',
      vendeur: 'pas',
      visite: 'non',
      prix: 'bas',
    });
    expect(r.dangerCount).toBe(0);
    expect(r.sum).toBe(9);
    expect(r.level).toBe('rouge');
  });

  it('moderate score (>=4) → orange', () => {
    const r = scoreSafety({ doc: 'delib', vendeur: 'pas' }); // 2 + 2 = 4
    expect(r.sum).toBe(4);
    expect(r.dangerCount).toBe(0);
    expect(r.level).toBe('orange');
  });

  it('ignores unanswered questions and invalid option keys', () => {
    const r = scoreSafety({ doc: 'tf', original: 'nonexistent-key' } as SafetyAnswers);
    expect(r.answered).toHaveLength(1);
    expect(r.answered[0]!.qid).toBe('doc');
  });

  it('flags exclude reassuring (risk-0) answers but answered includes them', () => {
    const r = scoreSafety({ doc: 'tf', interlocuteur: 'coxeur' }); // 0 + 3
    expect(r.answered).toHaveLength(2);
    expect(r.flags).toHaveLength(1);
    expect(r.flags[0]!.optKey).toBe('coxeur');
  });
});
