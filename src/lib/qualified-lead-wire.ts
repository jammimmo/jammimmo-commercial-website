import { z } from 'zod';
import { isValidLeadPhone } from './lead-validation';
import { parsePublicLeadQualification, type PublicLeadQualificationV1 } from './public-lead-qualification';

export type QualifiedLeadDeliveryMode = 'submit' | 'recover';
export type QualifiedLeadEnvelope = {
  submission_id: string; delivery_mode: QualifiedLeadDeliveryMode;
  full_name: string; phone: string; email?: string; message?: string; property_reference?: string;
  qualification: PublicLeadQualificationV1;
};
export type QualifiedLeadAcknowledgement = { ok: true; submission_id: string; qualification_version: 1 };
export type QualifiedLeadBusiness = {
  full_name: string; phone: string; email: string | null; message: string | null; property_reference: string | null;
  qualification: PublicLeadQualificationV1;
};
export type QualifiedLeadWireIssue = { path: string; code: 'invalid_envelope' | 'invalid_qualification' | 'unsupported_storage_text' };
export type QualifiedLeadEnvelopeParseResult =
  | { ok: true; value: QualifiedLeadEnvelope; business: QualifiedLeadBusiness; canonicalBusinessJSON: string }
  | { ok: false; issues: QualifiedLeadWireIssue[] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const PublicLeadIdentitySchema = z.object({
  full_name: z.string().trim().min(2).max(200),
  phone: z.string().trim().min(4).max(32).refine(isValidLeadPhone),
  email: z.preprocess(value => typeof value === 'string' ? value.trim() : value,
    z.union([z.literal(''), z.string().max(200).email()]).optional()).transform(value => value ? value.toLowerCase() : undefined),
  message: z.string().max(2000).optional().transform(value => value || undefined),
  property_reference: z.preprocess(value => typeof value === 'string' ? value.trim() : value,
    z.union([z.literal(''), z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{2,99}$/).refine(value => !UUID.test(value))]).optional()).transform(value => value || undefined),
});
const EnvelopeSchema = PublicLeadIdentitySchema.extend({
  submission_id: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i).transform(value => value.toLowerCase()),
  delivery_mode: z.enum(['submit', 'recover']), qualification: z.unknown(),
}).strict();

/** PostgreSQL TEXT/JSONB cannot represent NUL or isolated UTF-16 surrogates.
 * This is an adapter constraint, not a change to the frozen qualification DTO.
 */
export function isQualifiedLeadStorageText(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code === 0) return false;
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index++;
    } else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
}

/** Browser/server-safe normalization only: no bindings, clock, hashing or I/O.
 * Business JSON order is shared with management sync. Delivery metadata never
 * enters the fingerprint; a nonempty message is preserved, including spaces.
 */
export function parseQualifiedLeadEnvelope(input: unknown): QualifiedLeadEnvelopeParseResult {
  const parsed = EnvelopeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, issues: parsed.error.issues.map(issue => ({
    path: issue.path.length ? String(issue.path[0]) : '$', code: 'invalid_envelope',
  })) };
  const qualification = parsePublicLeadQualification(parsed.data.qualification);
  if (qualification.ok === false) return { ok: false, issues: qualification.issues.map(issue => ({
    path: issue.path === '$' ? 'qualification' : `qualification.${issue.path}`, code: 'invalid_qualification',
  })) };
  const value: QualifiedLeadEnvelope = { submission_id: parsed.data.submission_id, delivery_mode: parsed.data.delivery_mode,
    full_name: parsed.data.full_name, phone: parsed.data.phone,
    ...(parsed.data.email !== undefined ? { email: parsed.data.email } : {}),
    ...(parsed.data.message !== undefined ? { message: parsed.data.message } : {}),
    ...(parsed.data.property_reference !== undefined ? { property_reference: parsed.data.property_reference } : {}), qualification: qualification.value };
  const business: QualifiedLeadBusiness = { full_name: value.full_name, phone: value.phone, email: value.email ?? null,
    message: value.message ?? null, property_reference: value.property_reference ?? null, qualification: value.qualification };
  const textFields: [string, string | null][] = [['full_name', business.full_name], ['phone', business.phone], ['email', business.email],
    ['message', business.message], ['property_reference', business.property_reference],
    ['qualification.propertyTypeOther', value.qualification.propertyTypeOther], ['qualification.city', value.qualification.city],
    ['qualification.zone', value.qualification.zone], ['qualification.financing.other', value.qualification.financing.other],
    ['qualification.criteria.other', value.qualification.criteria.other]];
  const issues: QualifiedLeadWireIssue[] = textFields.filter(([, text]) => text !== null && !isQualifiedLeadStorageText(text))
    .map(([path]) => ({ path, code: 'unsupported_storage_text' }));
  if (issues.length) return { ok: false, issues };
  return { ok: true, value, business, canonicalBusinessJSON: JSON.stringify(business) };
}
