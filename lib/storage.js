const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(process.cwd(), 'data', 'state.json');
const DEFAULT_FILE = path.join(process.cwd(), 'public', 'default-state.json');

// Vercel KV (Upstash-backed) uses KV_REST_API_* names; direct Upstash uses UPSTASH_REDIS_REST_* names
function getRedisCredentials() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return (url && token) ? { url, token } : null;
}

function requiresRemoteStorage() {
  return !!(process.env.VERCEL || process.env.VERCEL_ENV);
}

function applyMigrations(state) {
  if (!state || !Array.isArray(state.patterns)) return { state, changed: false };
  let changed = false;

  // PN1-04: ensure b1-passe-compose-etre sits immediately after b1-avoir-conjugations
  const etreIdx = state.patterns.findIndex(p => p.id === 'b1-passe-compose-etre');
  const avoirIdx = state.patterns.findIndex(p => p.id === 'b1-avoir-conjugations');
  if (etreIdx !== -1 && avoirIdx !== -1 && etreIdx !== avoirIdx + 1) {
    const [etre] = state.patterns.splice(etreIdx, 1);
    const insertAt = state.patterns.findIndex(p => p.id === 'b1-avoir-conjugations') + 1;
    state.patterns.splice(insertAt, 0, etre);
    changed = true;
  }

  // Add verbsDrilled if missing, back-filled from session log
  if (!Array.isArray(state.verbsDrilled)) {
    const drilled = new Set();
    for (const session of (state.sessionLog || [])) {
      for (const verb of (session.verbsUsed || [])) drilled.add(verb);
    }
    state.verbsDrilled = Array.from(drilled);
    changed = true;
  }

  return { state, changed };
}

async function getState() {
  const creds = getRedisCredentials();
  if (creds) {
    const { Redis } = require('@upstash/redis');
    const redis = new Redis(creds);
    const raw = await redis.get('frenchTutorState');
    if (!raw) {
      const defaultPath = path.join(__dirname, '..', 'public', 'default-state.json');
      return JSON.parse(fs.readFileSync(defaultPath, 'utf8'));
    }
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const { state, changed } = applyMigrations(parsed);
    if (changed) await redis.set('frenchTutorState', JSON.stringify(state));
    return state;
  }
  if (requiresRemoteStorage()) {
    throw new Error(
      'Storage not configured: KV_REST_API_URL and KV_REST_API_TOKEN must be set in Vercel environment variables.'
    );
  }
  return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
}

async function setState(state) {
  const creds = getRedisCredentials();
  if (creds) {
    const { Redis } = require('@upstash/redis');
    const redis = new Redis(creds);
    await redis.set('frenchTutorState', JSON.stringify(state));
    return;
  }
  if (requiresRemoteStorage()) {
    throw new Error(
      'Storage not configured: KV_REST_API_URL and KV_REST_API_TOKEN must be set in Vercel environment variables.'
    );
  }
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

module.exports = { getState, setState };
