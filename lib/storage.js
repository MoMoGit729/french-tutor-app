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

async function getState() {
  const creds = getRedisCredentials();
  if (creds) {
    const { Redis } = require('@upstash/redis');
    const redis = new Redis(creds);
    const state = await redis.get('frenchTutorState');
    if (!state) {
      const defaultPath = path.join(__dirname, '..', 'public', 'default-state.json');
      return JSON.parse(fs.readFileSync(defaultPath, 'utf8'));
    }
    return typeof state === 'string' ? JSON.parse(state) : state;
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
