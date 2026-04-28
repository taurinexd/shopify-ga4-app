const DEBOUNCE_MS = 150;

// OS 2.0 themes: Dawn uses <variant-selects>, test-data and older Dawn use <variant-radios>.
// Both fire native 'change' on the element when a variant is picked.
const VARIANT_COMPONENT_SELECTOR = 'variant-selects, variant-radios';

export function observeVariantChange(callback: (variantId: string | null) => void): void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const fire = (variantId: string | null) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => callback(variantId), DEBOUNCE_MS);
  };

  const variantComponent = document.querySelector(VARIANT_COMPONENT_SELECTOR);
  if (variantComponent) {
    variantComponent.addEventListener('change', () => {
      const checked = variantComponent.querySelector<HTMLInputElement>('input[type="radio"]:checked');
      const idInput = document.querySelector<HTMLInputElement>('input[name="id"]');
      fire(idInput?.value ?? checked?.value ?? null);
    });
  }

  const idInput = document.querySelector('input[name="id"]');
  if (idInput) {
    const obs = new MutationObserver(() => {
      fire((idInput as HTMLInputElement).value);
    });
    obs.observe(idInput, { attributes: true, attributeFilter: ['value'] });
  }
}
