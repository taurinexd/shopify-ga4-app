import { describe, it, expect, beforeEach } from 'vitest';
import { applyConsentDefaults, updateConsent, getConsentState } from '../../src/datalayer/consent';

describe('Consent Mode v2', () => {
  beforeEach(() => {
    (window as any).dataLayer = [];
    (window as any).gtag = function (...args: unknown[]) {
      (window as any).dataLayer.push(args);
    };
  });

  it('applies DENIED defaults on init', () => {
    applyConsentDefaults();
    const last = (window as any).dataLayer.at(-1);
    expect(last[0]).toBe('consent');
    expect(last[1]).toBe('default');
    expect(last[2].ad_user_data).toBe('denied');
    expect(last[2].ad_personalization).toBe('denied');
    expect(last[2].analytics_storage).toBe('denied');
  });

  it('updates consent on grant', () => {
    applyConsentDefaults();
    updateConsent({ ad_user_data: 'granted', ad_personalization: 'granted', analytics_storage: 'granted' });
    const last = (window as any).dataLayer.at(-1);
    expect(last[1]).toBe('update');
    expect(last[2].ad_user_data).toBe('granted');
  });

  it('reflects state via getConsentState()', () => {
    applyConsentDefaults();
    updateConsent({ ad_user_data: 'granted' });
    expect(getConsentState().ad_user_data).toBe('granted');
    expect(getConsentState().ad_personalization).toBe('denied');
  });
});
