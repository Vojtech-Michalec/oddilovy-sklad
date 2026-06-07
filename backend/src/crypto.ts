/**
 * crypto.ts — Hashování hesel pomocí Web Crypto API (PBKDF2).
 *
 * Proč ne bcrypt?
 *   Cloudflare Workers mají CPU limit ~10ms (free tier) / ~30ms (paid).
 *   bcrypt s cost=10 zabere ~200ms CPU → Worker by přesáhl limit a hodil 503.
 *   PBKDF2 přes WebCrypto běží v nativním WASM → řádově rychlejší.
 *
 * Formát uloženého hashe: "<saltHex>:<hashHex>"
 *   - salt: 16 náhodných bajtů (128 bitů)
 *   - hash: SHA-256 odvozen z hesla a saltu přes 100 000 iterací
 */

const ITERATIONS = 100_000;
const HASH_ALG = 'SHA-256';
const KEY_LENGTH_BITS = 256;

/** Zahashuje heslo. Vrátí string ve formátu "saltHex:hashHex". */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt);
  return `${toHex(salt)}:${toHex(hash)}`;
}

/** Porovná heslo s uloženým hashem. Vrátí true, pokud souhlasí. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(':');
  if (parts.length !== 2) return false;
  const [saltHex, storedHashHex] = parts;
  const salt = fromHex(saltHex);
  const hash = await derive(password, salt);
  return toHex(hash) === storedHashHex;
}

async function derive(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: HASH_ALG, salt, iterations: ITERATIONS },
    keyMaterial,
    KEY_LENGTH_BITS
  );
  return new Uint8Array(bits);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array {
  return new Uint8Array((hex.match(/../g) ?? []).map(h => parseInt(h, 16)));
}
