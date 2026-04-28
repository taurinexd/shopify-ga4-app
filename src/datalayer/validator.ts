import { GA4Event } from './schema';

export interface ValidationResult {
  ok: boolean;
  errors?: string[];
}

export function validate(payload: unknown): ValidationResult {
  const result = GA4Event.safeParse(payload);
  if (result.success) return { ok: true };
  return {
    ok: false,
    errors: result.error.issues.map(
      (i) => `${i.path.join('.') || '<root>'}: ${i.message}`
    ),
  };
}
