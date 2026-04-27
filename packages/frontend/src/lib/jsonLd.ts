/**
 * Safely serialize a JSON-LD payload for embedding in a <script> tag.
 *
 * Escapes `<` to `\u003c` so a user-influenceable string field — provider
 * name, organization name, location health system, etc. — cannot terminate
 * the surrounding script tag with `</script>` and inject HTML. Schema.org
 * consumers parse the unicode escape correctly; HTML parsers can't break
 * out of the script tag.
 *
 * Used by the JSON-LD blocks in
 *   - app/provider/[npi]/page.tsx
 *   - app/location/[locationId]/page.tsx
 *
 * Add a third caller before adding any other transformation to this helper.
 */
export function safeJsonLd(payload: unknown): string {
  return JSON.stringify(payload).replace(/</g, '\\u003c');
}
