import { parseQualifiedLeadEnvelope, type QualifiedLeadEnvelope, type QualifiedLeadWireIssue } from './qualified-lead-wire';

export type QualifiedSubmission = Readonly<QualifiedLeadEnvelope>;
export class QualifiedSubmissionValidationError extends Error {
  constructor(readonly issues: readonly QualifiedLeadWireIssue[]) { super('invalid_qualified_submission'); }
}
export type QualifiedSubmissionResult = { status: 'accepted' } | { status: 'unknown' } | { status: 'rate_limited' };
// The UI retains this exact sealed object for the lifetime of its in-memory
// request. Once ambiguous, even a later 429 cannot make submission safe again.
const uncertain = new WeakSet<QualifiedSubmission>();

/** Normalize and copy before any await. The original business payload is never
 * rebuilt from a changed form during recovery. No PII goes to storage or logs. */
export function sealQualifiedSubmission(input: Omit<QualifiedLeadEnvelope, 'submission_id' | 'delivery_mode'>): QualifiedSubmission {
  const parsed = parseQualifiedLeadEnvelope({ ...input, submission_id: crypto.randomUUID(), delivery_mode: 'submit' });
  if (!parsed.ok) throw new QualifiedSubmissionValidationError(parsed.issues);
  const freeze = (value: object): void => {
    Object.values(value).forEach(child => { if (child && typeof child === 'object') freeze(child); });
    Object.freeze(value);
  };
  freeze(parsed.value);
  return parsed.value;
}

export async function sendQualifiedSubmission(
  submission: QualifiedSubmission,
  mode: 'submit' | 'recover',
  send: typeof fetch = fetch,
): Promise<QualifiedSubmissionResult> {
  // Only transport metadata changes. Neither a list read nor an old {ok:true}
  // can acknowledge this versioned business request.
  const deliveryMode = mode === 'recover' || uncertain.has(submission) ? 'recover' : 'submit';
  const body = JSON.stringify({ ...submission, delivery_mode: deliveryMode });
  try {
    const response = await send('/api/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    // The receiver rejects quota before INSERT. This narrow first refusal is
    // safe to retry explicitly with the SAME UUID and business payload.
    if (response.status === 429 && deliveryMode === 'submit' && !uncertain.has(submission)) return { status: 'rate_limited' };
    const data: unknown = await response.json();
    if (response.ok && data !== null && typeof data === 'object' && !Array.isArray(data)
      && Reflect.ownKeys(data).length === 3 && 'ok' in data && data.ok === true
      && 'submission_id' in data && data.submission_id === submission.submission_id
      && 'qualification_version' in data && data.qualification_version === 1) return { status: 'accepted' };
  } catch { /* A lost response may follow a durable INSERT. Keep the same intent. */ }
  uncertain.add(submission);
  return { status: 'unknown' };
}
