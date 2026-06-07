/**
 * types.ts — Sdílené typy pro Hono + Cloudflare Workers.
 *
 * Bindings = co je v c.env (D1 databáze, secrets, proměnné z wrangler.jsonc)
 * Variables = co middleware ukládá do c.var (přihlášený uživatel)
 * AppEnv    = zkratka pro generické parametry Hono
 */

export type Bindings = {
  DB: D1Database;
  RESEND_API_KEY: string;
  MAIL_FROM: string;
  FRONTEND_URL: string;
};

export type AuthUser = {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'user';
  login_count: number;
};

export type Variables = {
  user: AuthUser;
};

export type AppEnv = { Bindings: Bindings; Variables: Variables };
