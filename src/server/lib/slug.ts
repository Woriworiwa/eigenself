/**
 * Generates a URL-safe slug for a published profile.
 *
 * Format: <normalised-name>-<6-char random suffix>
 * Example: "omar-dalgamuni-a3f9xz"
 */
export function generateSlug(name?: string): string {
  const base = (name ?? 'user')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 40);

  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base}-${suffix}`;
}
