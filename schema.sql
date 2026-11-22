-- ============================================================================
-- OmniVibe Studio Cloudflare D1 Database Schema (schema.sql)
-- SQLite / Cloudflare D1 DDL for atomic offline license issuance & recovery
-- ============================================================================

CREATE TABLE IF NOT EXISTS licenses (
    license_key TEXT PRIMARY KEY,
    tier TEXT NOT NULL DEFAULT 'LIFETIME_PRO',
    buyer_email TEXT,
    buyer_name TEXT,
    source TEXT NOT NULL,
    external_session_id TEXT UNIQUE,
    amount_cents INTEGER DEFAULT 1900,
    activations_count INTEGER DEFAULT 0,
    max_activations INTEGER DEFAULT 5,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS checkout_events (
    session_id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    license_key TEXT,
    buyer_email TEXT,
    source TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_licenses_email ON licenses(buyer_email);
CREATE INDEX IF NOT EXISTS idx_licenses_session ON licenses(external_session_id);
CREATE INDEX IF NOT EXISTS idx_checkout_events_status ON checkout_events(status, created_at DESC);
