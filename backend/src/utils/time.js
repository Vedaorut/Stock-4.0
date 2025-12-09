/**
 * Time utilities to enforce UTC comparisons.
 */

// Return current UTC time as Date
export function nowUtc() {
  return new Date(Date.now());
}

// Compare expiration (Date|string) with current UTC time
export function isExpiredUtc(expiresAt) {
  const exp = new Date(expiresAt);
  return exp.getTime() < Date.now();
}
