import { validate } from './validator';

declare global {
  interface Window {
    dataLayer: unknown[];
    dataLayer_debug: Array<{ payload: unknown; errors: string[]; ts: number }>;
  }
}

export function initDataLayer(): void {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer_debug = window.dataLayer_debug || [];
}

let debugMode = false;
export function setDebugMode(on: boolean): void {
  debugMode = on;
}

export function safePush(payload: unknown): void {
  const { ok, errors } = validate(payload);
  if (ok) {
    window.dataLayer.push(payload);
    return;
  }
  window.dataLayer_debug.push({ payload, errors: errors!, ts: Date.now() });
  const sample = debugMode ? 1 : 0.1;
  if (Math.random() < sample) {
    // eslint-disable-next-line no-console
    console.warn('[ga4-datalayer] dropped invalid event', errors, payload);
  }
}
