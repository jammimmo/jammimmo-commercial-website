const SENEGAL_PHONE = /^(\+?221|00221)?\s*7[05678]\s*\d{3}\s*\d{2}\s*\d{2}\s*\d{0,2}$/;
const PHONE_CHARACTERS = /^\+?[\d\s().-]{7,32}$/;

/** Ported intake hardening: punctuation is not a substitute for actual digits. */
export function isValidLeadPhone(value: string): boolean {
  if (value !== value.trim() || !PHONE_CHARACTERS.test(value)) return false;
  const digits = value.replace(/\D/g, '').length;
  return digits >= 7 && digits <= 15 && (SENEGAL_PHONE.test(value) || PHONE_CHARACTERS.test(value));
}
