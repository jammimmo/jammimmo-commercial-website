/** Shared, dependency-free qualification DTO. No identity or submission envelope.
 * Text limits count Unicode code points (not UTF-16 units or graphemes).
 * Canonical JSON uses this schema's fixed key order and preserves array order.
 */
export const PUBLIC_LEAD_QUALIFICATION_VERSION = 1 as const;
export const PUBLIC_LEAD_QUALIFICATION_MAX_UTF8_BYTES = 4096;
export const PUBLIC_LEAD_QUALIFICATION_OPERATIONS = ['buy', 'rent', 'invest', 'lease_management'] as const;
export const PUBLIC_LEAD_QUALIFICATION_PROPERTY_TYPES = ['apartment', 'house', 'shop', 'office', 'land', 'farmland', 'warehouse', 'parking', 'building', 'other', 'villa'] as const;
export const PUBLIC_LEAD_QUALIFICATION_BUDGET_BASES = ['total', 'monthly'] as const;
export const PUBLIC_LEAD_QUALIFICATION_URGENCIES = ['immediate', 'one_month', 'three_months', 'browsing'] as const;
export const PUBLIC_LEAD_QUALIFICATION_FINANCING_AVAILABILITIES = ['yes', 'in_progress', 'no'] as const;
export const PUBLIC_LEAD_QUALIFICATION_FINANCING_METHODS = ['own_funds', 'bank', 'investor', 'other'] as const;
export const PUBLIC_LEAD_QUALIFICATION_FEATURES = ['parking', 'security', 'roadside', 'elevator', 'furnished', 'fiber'] as const;
export const PUBLIC_LEAD_QUALIFICATION_ADDITIONAL_NEEDS = ['legal_support', 'rental_management', 'property_investment', 'custom_search', 'property_advice'] as const;
export const PUBLIC_LEAD_QUALIFICATION_TEXT_LIMITS = { city: 100, zone: 150, propertyTypeOther: 120, financingOther: 120, criteriaOther: 500 } as const;

export type PublicLeadQualificationOperation = typeof PUBLIC_LEAD_QUALIFICATION_OPERATIONS[number];
export type PublicLeadQualificationPropertyType = typeof PUBLIC_LEAD_QUALIFICATION_PROPERTY_TYPES[number];
export type PublicLeadQualificationBudgetBasis = typeof PUBLIC_LEAD_QUALIFICATION_BUDGET_BASES[number];
export type PublicLeadQualificationUrgency = typeof PUBLIC_LEAD_QUALIFICATION_URGENCIES[number];
export type PublicLeadQualificationFinancingAvailability = typeof PUBLIC_LEAD_QUALIFICATION_FINANCING_AVAILABILITIES[number];
export type PublicLeadQualificationFinancingMethod = typeof PUBLIC_LEAD_QUALIFICATION_FINANCING_METHODS[number];
export type PublicLeadQualificationFeature = typeof PUBLIC_LEAD_QUALIFICATION_FEATURES[number];
export type PublicLeadQualificationAdditionalNeed = typeof PUBLIC_LEAD_QUALIFICATION_ADDITIONAL_NEEDS[number];

export type PublicLeadQualificationV1 = {
  readonly version: 1;
  readonly operation: PublicLeadQualificationOperation;
  readonly propertyType: PublicLeadQualificationPropertyType | null;
  readonly propertyTypeOther: string | null;
  readonly city: string | null;
  readonly zone: string | null;
  readonly budget: { readonly min: number | null; readonly max: number | null; readonly currency: 'XOF'; readonly basis: PublicLeadQualificationBudgetBasis | null };
  readonly urgency: PublicLeadQualificationUrgency | null;
  readonly financing: { readonly availability: PublicLeadQualificationFinancingAvailability | null; readonly method: PublicLeadQualificationFinancingMethod | null; readonly other: string | null };
  readonly criteria: { readonly bedrooms: number | null; readonly features: readonly PublicLeadQualificationFeature[]; readonly other: string | null };
  readonly additionalNeeds: readonly PublicLeadQualificationAdditionalNeed[];
};
export type PublicLeadQualificationIssueCode = 'invalid_type' | 'missing_key' | 'unknown_key' | 'invalid_version' | 'invalid_enum'
  | 'invalid_integer' | 'invalid_range' | 'duplicate' | 'too_many' | 'too_long' | 'inactive_value' | 'too_large';
export type PublicLeadQualificationIssue = { readonly path: string; readonly code: PublicLeadQualificationIssueCode };
export type PublicLeadQualificationParseResult =
  | { readonly ok: true; readonly value: PublicLeadQualificationV1; readonly canonicalJSON: string; readonly utf8Bytes: number }
  | { readonly ok: false; readonly issues: readonly PublicLeadQualificationIssue[] };

const ROOT_KEYS = ['version', 'operation', 'propertyType', 'propertyTypeOther', 'city', 'zone', 'budget', 'urgency', 'financing', 'criteria', 'additionalNeeds'] as const;
const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object'
  && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

export function parsePublicLeadQualification(input: unknown): PublicLeadQualificationParseResult {
  const issues: PublicLeadQualificationIssue[] = [];
  const issue = (path: string, code: PublicLeadQualificationIssueCode) => { issues.push({ path, code }); };
  // Error paths contain only known schema keys/indexes, never an unknown key
  // supplied by the caller: even a property name can contain personal data.
  const shape = (value: unknown, keys: readonly string[], path: string): Record<string, unknown> | null => {
    if (!isRecord(value)) { issue(path, 'invalid_type'); return null; }
    let valid = true;
    if (Reflect.ownKeys(value).some(key => typeof key !== 'string' || !keys.includes(key))) { issue(path, 'unknown_key'); valid = false; }
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key), fieldPath = path === '$' ? key : `${path}.${key}`;
      if (!descriptor) { issue(fieldPath, 'missing_key'); valid = false; }
      else if (!descriptor.enumerable || !('value' in descriptor)) { issue(fieldPath, 'invalid_type'); valid = false; }
    }
    return valid ? value : null;
  };
  const root = shape(input, ROOT_KEYS, '$');
  if (root === null) return { ok: false, issues };
  const budget = shape(root.budget, ['min', 'max', 'currency', 'basis'], 'budget');
  const financing = shape(root.financing, ['availability', 'method', 'other'], 'financing');
  const criteria = shape(root.criteria, ['bedrooms', 'features', 'other'], 'criteria');
  if (budget === null || financing === null || criteria === null) return { ok: false, issues };

  const enumeration = <T extends string>(value: unknown, values: readonly T[], path: string, nullable = true): T | null => {
    if (nullable && value === null) return null;
    const match = values.find(candidate => candidate === value);
    if (match === undefined) { issue(path, 'invalid_enum'); return null; }
    return match;
  };
  const text = (value: unknown, max: number, path: string): string | null => {
    if (value === null) return null;
    if (typeof value !== 'string') { issue(path, 'invalid_type'); return null; }
    const trimmed = value.trim();
    if (!trimmed) return null;
    if ([...trimmed].length > max) { issue(path, 'too_long'); return null; }
    return trimmed;
  };
  const integer = (value: unknown, path: string): number | null => {
    if (value === null) return null;
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) { issue(path, 'invalid_integer'); return null; }
    return value === 0 ? 0 : value;
  };
  const choices = <T extends string>(value: unknown, values: readonly T[], path: string): T[] => {
    if (!Array.isArray(value)) { issue(path, 'invalid_type'); return []; }
    if (value.length > values.length) { issue(path, 'too_many'); return []; }
    const result: T[] = [], seen = new Set<T>();
    for (let index = 0; index < value.length; index++) {
      const match = enumeration(value[index], values, `${path}[${index}]`, false);
      if (match === null) continue;
      if (seen.has(match)) issue(`${path}[${index}]`, 'duplicate');
      else { seen.add(match); result.push(match); }
    }
    return result;
  };

  if (root.version !== PUBLIC_LEAD_QUALIFICATION_VERSION) issue('version', 'invalid_version');
  const operation = enumeration(root.operation, PUBLIC_LEAD_QUALIFICATION_OPERATIONS, 'operation', false);
  const propertyType = enumeration(root.propertyType, PUBLIC_LEAD_QUALIFICATION_PROPERTY_TYPES, 'propertyType');
  const propertyTypeOther = text(root.propertyTypeOther, PUBLIC_LEAD_QUALIFICATION_TEXT_LIMITS.propertyTypeOther, 'propertyTypeOther');
  const city = text(root.city, PUBLIC_LEAD_QUALIFICATION_TEXT_LIMITS.city, 'city');
  const zone = text(root.zone, PUBLIC_LEAD_QUALIFICATION_TEXT_LIMITS.zone, 'zone');
  const min = integer(budget.min, 'budget.min'), max = integer(budget.max, 'budget.max');
  if (budget.currency !== 'XOF') issue('budget.currency', 'invalid_enum');
  const basis = enumeration(budget.basis, PUBLIC_LEAD_QUALIFICATION_BUDGET_BASES, 'budget.basis');
  const urgency = enumeration(root.urgency, PUBLIC_LEAD_QUALIFICATION_URGENCIES, 'urgency');
  const availability = enumeration(financing.availability, PUBLIC_LEAD_QUALIFICATION_FINANCING_AVAILABILITIES, 'financing.availability');
  const method = enumeration(financing.method, PUBLIC_LEAD_QUALIFICATION_FINANCING_METHODS, 'financing.method');
  const financingOther = text(financing.other, PUBLIC_LEAD_QUALIFICATION_TEXT_LIMITS.financingOther, 'financing.other');
  const bedrooms = integer(criteria.bedrooms, 'criteria.bedrooms');
  const features = choices(criteria.features, PUBLIC_LEAD_QUALIFICATION_FEATURES, 'criteria.features');
  const criteriaOther = text(criteria.other, PUBLIC_LEAD_QUALIFICATION_TEXT_LIMITS.criteriaOther, 'criteria.other');
  const additionalNeeds = choices(root.additionalNeeds, PUBLIC_LEAD_QUALIFICATION_ADDITIONAL_NEEDS, 'additionalNeeds');

  if (min !== null && max !== null && min > max) issue('budget', 'invalid_range');
  if (operation === 'buy' && basis === 'monthly' || operation === 'rent' && basis === 'total') issue('budget.basis', 'invalid_enum');
  if (propertyType !== 'other' && propertyTypeOther !== null) issue('propertyTypeOther', 'inactive_value');
  if (method !== 'other' && financingOther !== null) issue('financing.other', 'inactive_value');
  if (issues.length || operation === null) return { ok: false, issues };

  const value: PublicLeadQualificationV1 = {
    version: 1, operation, propertyType, propertyTypeOther, city, zone,
    budget: { min, max, currency: 'XOF', basis }, urgency,
    financing: { availability, method, other: financingOther },
    criteria: { bedrooms, features, other: criteriaOther }, additionalNeeds,
  };
  const canonicalJSON = JSON.stringify(value), utf8Bytes = new TextEncoder().encode(canonicalJSON).length;
  if (utf8Bytes > PUBLIC_LEAD_QUALIFICATION_MAX_UTF8_BYTES) return { ok: false, issues: [{ path: '$', code: 'too_large' }] };
  return { ok: true, value, canonicalJSON, utf8Bytes };
}
