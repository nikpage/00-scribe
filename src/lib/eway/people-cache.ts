import type { ContactOption } from "./journal";

// eWay is slow, so both people lists (contacts and employees) are pulled whole,
// once per worker, and filtered locally afterwards. This is that shared cache —
// keyed by list kind + worker so the two lists never bleed into each other.
const TTL_MS = 5 * 60 * 1000;

const cache = new Map<string, { people: ContactOption[]; expires: number }>();

export async function getCachedPeople(
  kind: "contacts" | "employees",
  userId: string,
  refresh: boolean,
  load: () => Promise<ContactOption[]>
): Promise<ContactOption[]> {
  const key = `${kind}:${userId}`;
  const entry = cache.get(key);
  if (!refresh && entry && entry.expires >= Date.now()) return entry.people;
  const people = await load();
  cache.set(key, { people, expires: Date.now() + TTL_MS });
  return people;
}
