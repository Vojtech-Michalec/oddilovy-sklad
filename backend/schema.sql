-- =====================================================================
--  SPRÁVA ODDÍLOVÉHO VYBAVENÍ
--  Engine: Cloudflare D1 (SQLite syntaxe)
--
--  Jak spustit:
--    Lokálně:   npm run db:init:local
--    Produkčně: npm run db:init:prod
-- =====================================================================

-- Pořadí DROP kvůli FK závislostem
DROP TABLE IF EXISTS auth_tokens;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS discard_logs;
DROP TABLE IF EXISTS borrowings;
DROP TABLE IF EXISTS equipment;
DROP TABLE IF EXISTS locations;
DROP TABLE IF EXISTS users;

-- ---------------------------------------------------------------------
-- USERS
-- is_active:    0 = čeká na aktivaci e-mailem, 1 = aktivní
-- is_blocked:   admin může zablokovat bez smazání účtu
-- login_count:  inkrementuje se při každém úspěšném přihlášení
-- last_login_at: kdy se naposledy přihlásil
-- last_online:  kdy naposledy provedl libovolný API request (middleware)
-- ---------------------------------------------------------------------
CREATE TABLE users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT    NOT NULL,
    email           TEXT    UNIQUE NOT NULL,
    password_hash   TEXT    NOT NULL,       -- PBKDF2 hash (Web Crypto API)
    role            TEXT    CHECK(role IN ('admin', 'user')) DEFAULT 'user',
    is_active       INTEGER NOT NULL DEFAULT 0,
    is_blocked      INTEGER NOT NULL DEFAULT 0,
    login_count     INTEGER NOT NULL DEFAULT 0,
    last_login_at   TEXT,
    last_online     TEXT,
    created_at      TEXT    DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------
-- LOCATIONS (sklady)
-- ---------------------------------------------------------------------
CREATE TABLE locations (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    address     TEXT,
    latitude    REAL,
    longitude   REAL,
    created_at  TEXT    DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------
-- EQUIPMENT (katalog vybavení)
-- Položky s total_quantity = 0 API nikdy nevrací (filtr v SQL).
-- DB je ponechává kvůli FK integritě v borrowings/discard_logs.
-- ---------------------------------------------------------------------
CREATE TABLE equipment (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT    NOT NULL,
    category        TEXT,
    total_quantity  INTEGER NOT NULL CHECK(total_quantity >= 0),
    location_id     INTEGER REFERENCES locations(id) ON DELETE SET NULL,
    created_at      TEXT    DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------
-- BORROWINGS (výpůjčky + rezervace)
-- status: 'active' | 'reservation' | 'returned' | 'cancelled'
-- ---------------------------------------------------------------------
CREATE TABLE borrowings (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    equipment_id    INTEGER REFERENCES equipment(id) ON DELETE RESTRICT,
    user_id         INTEGER REFERENCES users(id)     ON DELETE SET NULL,
    quantity        INTEGER NOT NULL DEFAULT 1 CHECK(quantity > 0),
    date_from       TEXT    NOT NULL,
    date_to         TEXT,
    status          TEXT    CHECK(status IN ('active', 'reservation', 'returned', 'cancelled'))
                            DEFAULT 'reservation',
    note            TEXT,
    created_at      TEXT    DEFAULT (datetime('now')),
    updated_at      TEXT    DEFAULT (datetime('now')),
    updated_by      INTEGER REFERENCES users(id) ON DELETE SET NULL
);

-- ---------------------------------------------------------------------
-- DISCARD_LOGS (odpisy zničeného / ztraceného vybavení)
-- ---------------------------------------------------------------------
CREATE TABLE discard_logs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    equipment_id    INTEGER REFERENCES equipment(id) ON DELETE CASCADE,
    user_id         INTEGER REFERENCES users(id)     ON DELETE SET NULL,
    quantity        INTEGER NOT NULL CHECK(quantity > 0),
    reason          TEXT    NOT NULL,
    created_at      TEXT    DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------
-- SESSIONS (databázové relace — náhrada JWT)
-- token: 64znakový hex (32 bytes z crypto.getRandomValues)
-- Middleware při každém requestu ověří token + zkontroluje expires_at
-- a is_blocked uživatele.
-- ---------------------------------------------------------------------
CREATE TABLE sessions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token       TEXT    UNIQUE NOT NULL,
    ip_address  TEXT,
    user_agent  TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    expires_at  TEXT    NOT NULL
);
CREATE INDEX idx_sessions_token  ON sessions(token);
CREATE INDEX idx_sessions_user   ON sessions(user_id);

-- ---------------------------------------------------------------------
-- AUTH_TOKENS (aktivace účtu + reset hesla)
-- purpose: 'email_verify' | 'password_reset'
-- used_at: vyplní se při použití → token je jednorázový
-- ---------------------------------------------------------------------
CREATE TABLE auth_tokens (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token       TEXT    UNIQUE NOT NULL,
    purpose     TEXT    NOT NULL CHECK(purpose IN ('email_verify', 'password_reset')),
    expires_at  TEXT    NOT NULL,
    used_at     TEXT,
    created_at  TEXT    DEFAULT (datetime('now'))
);
CREATE INDEX idx_auth_tokens_token ON auth_tokens(token);
