import { describe, expect, it, vi } from 'vitest';
import { sealQualifiedSubmission, sendQualifiedSubmission } from './qualified-lead-submit';
import type { PublicLeadQualificationV1 } from './public-lead-qualification';
const qualification: PublicLeadQualificationV1 = { version: 1, operation: 'invest', propertyType: null, propertyTypeOther: null, city: null, zone: null, budget: { min: 0, max: null, currency: 'XOF', basis: null }, urgency: null, financing: { availability: 'no', method: null, other: null }, criteria: { bedrooms: null, features: [], other: null }, additionalNeeds: [] };
const make = () => sealQualifiedSubmission({ full_name: 'Personne entièrement fictive', phone: '+221000000003', qualification });
describe('qualified submission causal acknowledgement', () => {
  it('copies before dispatch and requires the exact versioned acknowledgement', async () => {
    const input = { full_name: 'Personne entièrement fictive', phone: '+221000000003', qualification: { ...qualification, budget: { ...qualification.budget } } };
    const sealed = sealQualifiedSubmission(input); input.full_name = 'Changed later'; input.qualification.budget.max = 42;
    const send = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ ok: true, submission_id: sealed.submission_id, qualification_version: 1 }), { status: 201 }));
    expect(await sendQualifiedSubmission(sealed, 'submit', send)).toEqual({ status: 'accepted' });
    expect(JSON.parse(String(send.mock.calls[0][1]?.body))).toMatchObject({ full_name: 'Personne entièrement fictive', qualification: { budget: { max: null } } });
    expect(Object.isFrozen(sealed.qualification.budget)).toBe(true);
  });
  it('keeps a lost response uncertain and recovers only the same business request', async () => {
    const sealed = make(); const payloads: unknown[] = [];
    const send: typeof fetch = vi.fn(async (_url, init) => { payloads.push(JSON.parse(String(init?.body))); if (payloads.length === 1) throw new Error('lost after commit'); return new Response(JSON.stringify({ ok: true, submission_id: sealed.submission_id, qualification_version: 1 })); });
    expect(await sendQualifiedSubmission(sealed, 'submit', send)).toEqual({ status: 'unknown' });
    expect(await sendQualifiedSubmission(sealed, 'recover', send)).toEqual({ status: 'accepted' });
    expect(payloads[1]).toEqual({ ...(payloads[0] as object), delivery_mode: 'recover' });
  });
  it('does not treat old ok, foreign UUID, wrong version or an existing-only absence as acknowledgement', async () => {
    const sealed = make();
    for (const data of [{ ok: true }, { ok: true, submission_id: '00000000-0000-4000-8000-000000000000', qualification_version: 1 }, { ok: true, submission_id: sealed.submission_id, qualification_version: 2 }, { ok: false, status: 'unconfirmed' }]) {
      expect(await sendQualifiedSubmission(sealed, 'recover', async () => new Response(JSON.stringify(data)))).toEqual({ status: 'unknown' });
    }
  });
  it('permits an explicit retry after a first certain quota refusal with the same UUID and payload', async () => {
    const sealed = make(); const payloads: unknown[] = [];
    const send: typeof fetch = vi.fn(async (_url, init) => {
      payloads.push(JSON.parse(String(init?.body)));
      return payloads.length === 1 ? new Response('{"error":"limited"}', { status: 429 })
        : new Response(JSON.stringify({ ok: true, submission_id: sealed.submission_id, qualification_version: 1 }));
    });
    expect(await sendQualifiedSubmission(sealed, 'submit', send)).toEqual({ status: 'rate_limited' });
    expect(await sendQualifiedSubmission(sealed, 'submit', send)).toEqual({ status: 'accepted' });
    expect(payloads[1]).toEqual(payloads[0]);
  });
  it('never re-enables submit when a quota response follows an ambiguous attempt', async () => {
    const sealed = make(); const payloads: { delivery_mode: string }[] = [];
    const send: typeof fetch = vi.fn(async (_url, init) => { payloads.push(JSON.parse(String(init?.body))); if (payloads.length === 1) return new Response('{"ok":true}'); return new Response('{"error":"limited"}', { status: 429 }); });
    expect(await sendQualifiedSubmission(sealed, 'submit', send)).toEqual({ status: 'unknown' });
    expect(await sendQualifiedSubmission(sealed, 'recover', send)).toEqual({ status: 'unknown' });
    expect(await sendQualifiedSubmission(sealed, 'submit', send)).toEqual({ status: 'unknown' });
    expect(payloads.map(value => value.delivery_mode)).toEqual(['submit', 'recover', 'recover']);
  });

});
