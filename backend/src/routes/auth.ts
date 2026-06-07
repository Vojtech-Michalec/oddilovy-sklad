/**
 * routes/auth.ts — Registrace, přihlášení, odhlášení, aktivace, reset hesla.
 *
 * Hlavní změny oproti Node.js verzi:
 *   - Vše je async (D1 API je asynchronní).
 *   - DB přístup přes c.env.DB (D1 binding), ne import singleton.
 *   - Hesla hashujeme PBKDF2 přes Web Crypto (bcrypt nefunguje na Workers).
 *   - c.env.RESEND_API_KEY / MAIL_FROM / FRONTEND_URL z wrangler.jsonc.
 *   - db.batch([]) = atomická transakce v D1.
 */

import { Hono } from 'hono';
import { setCookie, deleteCookie, getCookie } from 'hono/cookie';
import type { AppEnv } from '../types';
import { createSession, destroySession } from '../sessions';
import { hashPassword, verifyPassword } from '../crypto';
import { sendActivationEmail, sendPasswordResetEmail } from '../mailer';

const auth = new Hono<AppEnv>();

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function newToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function setSessionCookie(c: any, token: string, expiresAt: Date) {
  setCookie(c, 'session_token', token, {
    httpOnly: true,
    secure: true,
    // SameSite=None je nutné pro cross-origin cookies (frontend a backend
    // jsou na různých doménách). Vyžaduje Secure=true (HTTPS).
    sameSite: 'None',
    path: '/',
    expires: expiresAt,
  });
}

// --- REGISTRACE -------------------------------------------------------------

auth.post('/register', async (c) => {
  try {
    console.log('[register] Request přišel');

    const { name, email, password } = await c.req.json<{
      name: string; email: string; password: string;
    }>();
    console.log('[register] Data:', { name, email, passwordLen: password?.length });

    if (!name?.trim() || !isValidEmail(email) || !password || password.length < 6) {
      console.log('[register] Validace selhala');
      return c.json({ error: 'Vyplňte jméno, platný e-mail a heslo (min. 6 znaků).' }, 400);
    }

    const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?')
      .bind(email).first();
    console.log('[register] Existující uživatel:', existing ? 'ANO → vracím early' : 'NE → pokračuju');
    if (existing) {
      return c.json({ message: 'Pokud je e-mail volný, byl odeslán aktivační odkaz.' }, 201);
    }

    const countRow = await c.env.DB.prepare('SELECT COUNT(*) AS cnt FROM users').first<{ cnt: number }>();
    const role = (countRow?.cnt ?? 0) === 0 ? 'admin' : 'user';
    console.log('[register] Přiřazená role:', role);

    const passwordHash = await hashPassword(password);
    console.log('[register] Heslo zahashováno');

    const userId = await c.env.DB.prepare(`
      INSERT INTO users (name, email, password_hash, is_active, role)
      VALUES (?, ?, ?, 0, ?)
    `).bind(name.trim(), email.toLowerCase(), passwordHash, role).run()
      .then(r => Number(r.meta.last_row_id));
    console.log('[register] Uživatel vložen do DB, id:', userId);

    const token = newToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await c.env.DB.prepare(`
      INSERT INTO auth_tokens (user_id, token, purpose, expires_at)
      VALUES (?, ?, 'email_verify', ?)
    `).bind(userId, token, expiresAt).run();
    console.log('[register] Auth token uložen');

    console.log('[register] Volám sendActivationEmail...');
    console.log('[register] RESEND_API_KEY nastaven:', !!c.env.RESEND_API_KEY);
    console.log('[register] MAIL_FROM:', c.env.MAIL_FROM);
    console.log('[register] FRONTEND_URL:', c.env.FRONTEND_URL);

    try {
      await sendActivationEmail(
        email, name.trim(), token,
        c.env.RESEND_API_KEY, c.env.MAIL_FROM, c.env.FRONTEND_URL
      );
      console.log('[register] Email odeslán úspěšně');
    } catch (mailErr: any) {
      console.error('[register] CHYBA při odesílání emailu:', mailErr.message);
    }

    return c.json({ message: 'Registrace proběhla. Zkontroluj e-mail a aktivuj účet.' }, 201);
  } catch (e: any) {
    console.error('[register] NEOČEKÁVANÁ CHYBA:', e.message);
    return c.json({ error: 'Chyba serveru: ' + e.message }, 500);
  }
});

// --- AKTIVACE ÚČTU ----------------------------------------------------------

auth.get('/activate', async (c) => {
  const token = c.req.query('token');
  if (!token) return c.json({ error: 'Chybí token.' }, 400);

  const row = await c.env.DB.prepare(`
    SELECT id, user_id, expires_at, used_at
      FROM auth_tokens
     WHERE token = ? AND purpose = 'email_verify'
  `).bind(token).first<{ id: number; user_id: number; expires_at: string; used_at: string | null }>();

  if (!row || row.used_at || row.expires_at < new Date().toISOString()) {
    return c.json({ error: 'Token neplatný nebo již použitý.' }, 400);
  }

  // Atomicky aktivuj účet + označ token jako použitý.
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE users SET is_active = 1 WHERE id = ?').bind(row.user_id),
    c.env.DB.prepare("UPDATE auth_tokens SET used_at = datetime('now') WHERE id = ?").bind(row.id),
  ]);

  return c.json({ message: 'Účet byl aktivován. Nyní se můžeš přihlásit.' });
});

// --- PŘIHLÁŠENÍ -------------------------------------------------------------

auth.post('/login', async (c) => {
  try {
    const { email, password } = await c.req.json<{ email: string; password: string }>();

    const user = await c.env.DB.prepare(`
      SELECT id, name, email, password_hash, role, is_active, is_blocked
        FROM users WHERE email = ?
    `).bind(email.toLowerCase()).first<{
      id: number; name: string; email: string; password_hash: string;
      role: string; is_active: number; is_blocked: number;
    }>();

    // Záměrně obecná chyba — neodhaluje, zda e-mail existuje.
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return c.json({ error: 'Nesprávný e-mail nebo heslo.' }, 401);
    }

    if (!user.is_active) {
      return c.json({ error: 'Účet ještě není aktivován. Zkontroluj e-mail.' }, 403);
    }

    if (user.is_blocked) {
      return c.json({ error: 'Váš účet byl zablokován. Kontaktujte administrátora.' }, 403);
    }

    const ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || '';
    const ua = c.req.header('user-agent') || '';
    const { token, expiresAt } = await createSession(c.env.DB, user.id, ip, ua);
    setSessionCookie(c, token, expiresAt);

    return c.json({
      message: 'Přihlášení úspěšné.',
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (e: any) {
    return c.json({ error: 'Chyba serveru: ' + e.message }, 500);
  }
});

// --- ODHLÁŠENÍ --------------------------------------------------------------

auth.post('/logout', async (c) => {
  const token = getCookie(c, 'session_token');
  if (token) await destroySession(c.env.DB, token);
  deleteCookie(c, 'session_token', { path: '/', sameSite: 'None', secure: true });
  return c.json({ message: 'Byli jste odhlášeni.' });
});

// --- OVĚŘENÍ SESSION (volá frontend při startu) -----------------------------

auth.get('/authcheck', async (c) => {
  const token = getCookie(c, 'session_token');
  if (!token) return c.json({ authenticated: false }, 401);

  const row = await c.env.DB.prepare(`
    SELECT u.id, u.name, u.email, u.role, u.login_count, u.is_blocked, s.expires_at
      FROM sessions s
      JOIN users u ON u.id = s.user_id
     WHERE s.token = ?
  `).bind(token).first<{
    id: number; name: string; email: string; role: string;
    login_count: number; is_blocked: number; expires_at: string;
  }>();

  if (!row || row.expires_at < new Date().toISOString() || row.is_blocked) {
    deleteCookie(c, 'session_token', { path: '/', sameSite: 'None', secure: true });
    return c.json({ authenticated: false }, 401);
  }

  return c.json({
    authenticated: true,
    user: { id: row.id, name: row.name, email: row.email, role: row.role },
  });
});

// --- ZAPOMENUTÉ HESLO -------------------------------------------------------

auth.post('/forgot-password', async (c) => {
  try {
    const { email } = await c.req.json<{ email: string }>();
    if (!isValidEmail(email)) return c.json({ error: 'Neplatný e-mail.' }, 400);

    const user = await c.env.DB.prepare('SELECT id, name FROM users WHERE email = ?')
      .bind(email.toLowerCase()).first<{ id: number; name: string }>();

    if (user) {
      const token = newToken();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hodina
      await c.env.DB.prepare(`
        INSERT INTO auth_tokens (user_id, token, purpose, expires_at)
        VALUES (?, ?, 'password_reset', ?)
      `).bind(user.id, token, expiresAt).run();

      try {
        await sendPasswordResetEmail(
          email, user.name, token,
          c.env.RESEND_API_KEY, c.env.MAIL_FROM, c.env.FRONTEND_URL
        );
      } catch (mailErr: any) {
        console.error('Chyba odeslání reset e-mailu:', mailErr.message);
      }
    }

    // Vždy stejná odpověď — zabraňuje zjistit, zda e-mail existuje.
    return c.json({ message: 'Pokud e-mail existuje, byl odeslán odkaz pro reset hesla.' });
  } catch (e: any) {
    return c.json({ error: 'Chyba serveru: ' + e.message }, 500);
  }
});

// --- RESET HESLA ------------------------------------------------------------

auth.post('/reset-password', async (c) => {
  try {
    const { token, password } = await c.req.json<{ token: string; password: string }>();

    if (!token || !password || password.length < 6) {
      return c.json({ error: 'Token a heslo (min. 6 znaků) jsou povinné.' }, 400);
    }

    const row = await c.env.DB.prepare(`
      SELECT id, user_id, expires_at, used_at FROM auth_tokens
       WHERE token = ? AND purpose = 'password_reset'
    `).bind(token).first<{
      id: number; user_id: number; expires_at: string; used_at: string | null;
    }>();

    if (!row || row.used_at || row.expires_at < new Date().toISOString()) {
      return c.json({ error: 'Odkaz pro reset je neplatný nebo již použitý.' }, 400);
    }

    const passwordHash = await hashPassword(password);

    // Atomicky: změň heslo, označ token jako použitý, zneplatni všechny sessions.
    await c.env.DB.batch([
      c.env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
        .bind(passwordHash, row.user_id),
      c.env.DB.prepare("UPDATE auth_tokens SET used_at = datetime('now') WHERE id = ?")
        .bind(row.id),
      c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?')
        .bind(row.user_id),
    ]);

    return c.json({ message: 'Heslo bylo změněno. Nyní se můžeš přihlásit.' });
  } catch (e: any) {
    return c.json({ error: 'Chyba serveru: ' + e.message }, 500);
  }
});

export default auth;
