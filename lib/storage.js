const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(process.cwd(), 'data', 'state.json');
const DEFAULT_FILE = path.join(process.cwd(), 'public', 'default-state.json');

function isUpstash() {
  return !!process.env.UPSTASH_REDIS_REST_URL;
}

async function getState() {
  if (isUpstash()) {
    const { Redis } = require('@upstash/redis');
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN
    });
    const state = await redis.get('frenchTutorState');
    if (!state) {
      return JSON.parse(fs.readFileSync(DEFAULT_FILE, 'utf8'));
    }
    return state;
  }
  return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
}

async function setState(state) {
  if (isUpstash()) {
    const { Redis } = require('@upstash/redis');
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN
    });
    await redis.set('frenchTutorState', JSON.stringify(state));
  } else {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  }
}

module.exports = { getState, setState };
