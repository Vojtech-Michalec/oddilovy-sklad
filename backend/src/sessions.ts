/**
 * sessions.ts — Správa DB relací pro Cloudflare D1.
 *
 * Klíčové změny oproti Node.js verzi:
 *   - Všechny DB operace jsou async (D1 vrací Promise, ne výsledek přímo).
 *   - db.batch([...]) = D1 ekvivalent SQLite transakce (atomická sada příkazů).
 *   - Token generujeme přes crypto.getRandomValues() (nativní ve Workers).
 *   - D1 se předává jako parametr funkcí — není globální singleton.
 */

const SESSION_DURATION_DAYS = 7;

/** Vygeneruje bezpečný 64znakový hex token (32 bytes entropie). */
export function generateToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Vytvoří session v DB a inkrementuje login_count + aktualizuje last_login_at.
 * db.batch() zajistí, že oba příkazy proběhnou atomicky.
 */
export async function createSession(
  db: D1Database,
  userId: number,
  ip?: string,
  ua?: string
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_DURATION_DAYS);

  await db.batch([
    db.prepare(`
      INSERT INTO sessions (user_id, token, ip_address, user_agent, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `).bind(userId, token, ip ?? null, ua ?? null, expiresAt.toISOString()),

    db.prepare(`
      UPDATE users
         SET login_count   = login_count + 1,
             last_login_at = datetime('now')
       WHERE id = ?
    `).bind(userId),
  ]);

  return { token, expiresAt };
}

/** Smaže session = odhlášení. */
export async function destroySession(db: D1Database, token: string): Promise<void> {
  await db.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
}

/** Periodický úklid expirovaných sessions (volej z cronu nebo při startu). */
export async function cleanupExpiredSessions(db: D1Database): Promise<void> {
  await db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run();
}
