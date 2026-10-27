/** The canonical URL segment stored for a product. */
export function normalizeProductSlug(value: string): string {
  return value.trim().normalize('NFC').toLowerCase();
}

/** Slugs support English and Persian/Arabic words joined with single hyphens. */
export function isValidProductSlug(value: string): boolean {
  if (!value || value.length > 160 || value !== normalizeProductSlug(value)) return false;
  return value.split('-').every(part => part.length > 0 && [...part].every(character =>
    /^[a-z0-9\u0660-\u0669\u06F0-\u06F9]$/.test(character)
    || (/^\p{Letter}$/u.test(character) && /^\p{Script=Arabic}$/u.test(character)),
  ));
}
