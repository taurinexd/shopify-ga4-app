type ConsentValue = 'granted' | 'denied';
type ConsentField = 'ad_user_data' | 'ad_personalization' | 'analytics_storage' | 'ad_storage';

declare global {
  interface Window { gtag?: (...args: unknown[]) => void; }
}

const DEFAULTS: Record<ConsentField, ConsentValue> = {
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  analytics_storage: 'denied',
  ad_storage: 'denied',
};

const state: Record<ConsentField, ConsentValue> = { ...DEFAULTS };

export function applyConsentDefaults(): void {
  Object.assign(state, DEFAULTS);
  ensureGtag();
  window.gtag!('consent', 'default', state);
}

export function updateConsent(partial: Partial<Record<ConsentField, ConsentValue>>): void {
  Object.assign(state, partial);
  ensureGtag();
  window.gtag!('consent', 'update', state);
}

export function getConsentState(): Readonly<typeof state> {
  return { ...state };
}

function ensureGtag(): void {
  if (window.gtag) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function (...args: unknown[]) {
    (window.dataLayer as unknown[]).push(args);
  };
}
