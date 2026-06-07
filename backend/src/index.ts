/**
 * index.ts — Vstupní bod Cloudflare Workers backendu.
 *
 * Klíčový rozdíl od Node.js: Workers nestartuají HTTP server.
 * Místo toho exportují objekt s `fetch` handlerem, který Workers runtime
 * volá při každém příchozím requestu.
 *
 * `export default app` = Hono automaticky poskytne správný fetch handler.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';

import type { AppEnv } from './types';
import { authMiddleware, adminOnly } from './middleware';

import authRoutes from './routes/auth';
import equipmentRoutes from './routes/equipment';
import borrowingsRoutes from './routes/borrowings';
import locationsRoutes from './routes/locations';
import adminRoutes from './routes/admin';

const app = new Hono<AppEnv>();

// --- CORS -------------------------------------------------------------------
// credentials: true je nutné, aby prohlížeč posílal HttpOnly cookie.
// Origin se čte z c.env.FRONTEND_URL (definováno ve wrangler.jsonc / .dev.vars).

app.use('/api/*', async (c, next) => {
  return cors({
    origin: c.env.FRONTEND_URL,
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
    credentials: true,
  })(c, next);
});

// --- Veřejné endpointy ------------------------------------------------------
app.route('/api/auth', authRoutes);

// --- Chráněné endpointy (vyžadují platnou session) --------------------------
app.use('/api/equipment/*', authMiddleware);
app.use('/api/borrowings/*', authMiddleware);
app.use('/api/locations/*', authMiddleware);
app.use('/api/admin/*', authMiddleware);
// Admin route navíc vyžaduje roli 'admin'
app.use('/api/admin/*', adminOnly);

app.route('/api/equipment', equipmentRoutes);
app.route('/api/borrowings', borrowingsRoutes);
app.route('/api/locations', locationsRoutes);
app.route('/api/admin', adminRoutes);

// --- Healthcheck ------------------------------------------------------------
app.get('/health', (c) => c.json({ ok: true, ts: new Date().toISOString() }));

// Workers export — toto je to, co Workers runtime volá
export default app;
