/**
 * KidSchedule – Family Proxy Number Assignment
 *
 * Assigns a deterministic Twilio proxy number per family from a configured pool.
 */

function hashFamilyId(familyId: string): number {
  let hash = 0;
  for (let i = 0; i < familyId.length; i++) {
    hash = (hash * 31 + familyId.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function getProxyPool(): string[] {
  const configured = process.env.TWILIO_PROXY_NUMBER_POOL ?? "";
  return configured
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function getProxyNumberForFamily(familyId: string): string | null {
  const pool = getProxyPool();
  if (pool.length === 0) {
    return process.env.TWILIO_PROXY_DEFAULT_NUMBER ?? null;
  }

  const index = hashFamilyId(familyId) % pool.length;
  return pool[index] ?? null;
}
