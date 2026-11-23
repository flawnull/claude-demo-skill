// Invented product names: short, and not already used by a real product.

export const slugName = (n) => n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Rules for the name itself, before any lookup. */
export function nameShape(name) {
  const problems = [];
  const letters = name.replace(/[^A-Za-z0-9]/g, "");
  if (letters.length < 3) problems.push("shorter than 3 letters");
  if (letters.length > 8) problems.push("longer than 8 letters: invented names stay short");
  if (/\s/.test(name.trim())) problems.push("more than one word");
  return problems;
}

/**
 * hits: [{ source, found, detail }] from the lookups. A name is taken when any real product,
 * package, app or site of that exact name turns up.
 */
export function verdict(name, hits) {
  const shape = nameShape(name);
  // a parked domain or an old package is noise; a real app or a popular project is a product
  const taken = hits.filter((h) => h.found && !h.weak);
  const notes = hits.filter((h) => h.found && h.weak);
  const unknown = hits.filter((h) => h.found == null);
  return {
    name,
    ok: !shape.length && !taken.length,
    shape,
    taken: taken.map((h) => `${h.source}: ${h.detail}`),
    notes: notes.map((h) => `${h.source}: ${h.detail}`),
    unchecked: unknown.map((h) => h.source),
  };
}
