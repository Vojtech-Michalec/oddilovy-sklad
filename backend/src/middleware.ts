/**
 * middleware.ts — Ochrana API endpointů přes DB sessions.
 *
 * authMiddleware:
 *   1) Přečte session_token z HttpOnly cookie.
 *   2) Najde session v D1 — ověří expiraci.
 *   3) Zkontroluje, zda uživatel není blokovaný (is_blocked).
 *   4) Aktualizuje last_online (kdy naposledy provedl API request).
 *   5) Uloží uživatele do c.var.user pro route handlery.
 *
 * waitUntil: aktualizace last_online se spustí "na pozadí" po odeslání
 * odpovědi — nebrzdí request, ale Workers ji dokončí před ukončením.
 */

import type { Context, Next } from 'hono';
import { getCookie, deleteCookie } from 'hono/cookie';
import type { AppEnv, AuthUser } from './types';

export async function authMiddleware(c: Context<AppEnv>, next: Next) {
  const token = getCookie(c, 'session_token');

  if (!token) {
    return c.json({ error: 'Nejste přihlášeni.' }, 401);
  }

  const row = await c.env.DB.prepare(`
    SELECT u.id, u.name, u.email, u.role, u.login_count,
           u.is_blocked, s.expires_at
      FROM sessions s
      JOIN users u ON u.id = s.user_id
     WHERE s.token = ?
  `).bind(token).first<{
    id: number; name: string; email: string; role: string;
    login_count: number; is_blocked: number; expires_at: string;
  }>();

  if (!row) {
    deleteCookie(c, 'session_token', { path: '/', sameSite: 'None', secure: true });
    return c.json({ error: 'Relace neplatná nebo vypršela.' }, 401);
  }

  if (row.expires_at < new Date().toISOString()) {
    // Expired session — smaž ji a odmítni request
    await c.env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
    deleteCookie(c, 'session_token', { path: '/', sameSite: 'None', secure: true });
    return c.json({ error: 'Relace vypršela. Přihlaste se znovu.' }, 401);
  }

  if (row.is_blocked) {
    deleteCookie(c, 'session_token', { path: '/', sameSite: 'None', secure: true });
    return c.json({ error: 'Váš účet byl zablokován. Kontaktujte administrátora.' }, 403);
  }

  // Aktualizuj last_online na pozadí — nezdržuje odpověď
  c.executionCtx.waitUntil(
    c.env.DB.prepare("UPDATE users SET last_online = datetime('now') WHERE id = ?")
      .bind(row.id)
      .run()
  );

  c.set('user', {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role as 'admin' | 'user',
    login_count: row.login_count,
  } satisfies AuthUser);

  await next();
}

/** Použij jako druhý middleware na admin endpointy — za authMiddleware. */
export async function adminOnly(c: Context<AppEnv>, next: Next) {
  const user = c.get('user');
  if (!user || user.role !== 'admin') {
    return c.json({ error: 'K této akci jsou potřeba admin práva.' }, 403);
  }
  await next();
}
