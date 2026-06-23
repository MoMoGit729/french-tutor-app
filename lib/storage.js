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

const TEACHING_DEVICES = {
  'b1-passe-compose-avoir': "Café é trick: take any -ation word (réservation), chop off -ation, add é to get the past participle (réservé, préparé, visité). Three-into-one: 'I reserved', 'I have reserved', and 'I did reserve' are all J'ai réservé in French. 1,250 -ion words: any English -ion word is also a French word (réservation, invitation, décoration).",
  'b1-avoir-conjugations': "Default ils: a mixed group always uses ils, even 99 women and 1 man — if in doubt, use ils.",
  'b1-passe-compose-etre': "Coming and going rule: use être (not avoir) in the past for any verb involving going or coming — aller, venir, partir, arriver, rester, sortir, monter, descendre, naître, mourir. Rester exception: rester also uses être — 'after going somewhere, you need somewhere to stay.' Fiancé rule: the past participle agrees with the subject like fiancé/fiancée — one man = allé, one woman = allée, group of men/mixed = allés, all-female group = allées.",
  'b1-questions-est-ce-que': "Three ways to ask questions: (1) inversion — Avez-vous réservé?; (2) est-ce que — put it in front of any statement to make it a question; (3) rising intonation — raise pitch at end of a statement (spoken only, not in writing).",
  'b1-questions-inversion': "Three ways to ask questions: (1) inversion — Avez-vous réservé?; (2) est-ce que — Est-ce que vous avez réservé?; (3) rising intonation (spoken only). Inversion is preferred in formal written French.",
  'b1-pronouns-le-la-les': "Have-stealing rule: 'have' always steals the pronoun and places it directly in front of itself — Je l'ai préparé (not 'J'ai le préparé'). Pronouns like it, me, you, him, her, them all move in front of avoir in the past tense.",
  'b1-pronoun-en': "Have-stealing rule applies to en too — en goes directly before avoir: J'en ai mangé (not 'J'ai mangé en').",
  'b1-vouloir': "Silent ent: ils veulent sounds like 'vurl' — the 'ent' ending is always silent when it comes at the end of a verb after 'they'.",
  'b1-pouvoir': "Silent ent: ils peuvent sounds like 'perv' — the 'ent' ending is always silent after 'they'.",
  'b1-devoir': "Silent ent: ils doivent sounds like 'dwoirve' — the 'ent' ending is always silent after 'they'.",
  'b1-present-tense-er': "Chop the R: for je/il/elle/tu/ils/elles — chop the r off the infinitive (préparer → prépare, manger → mange). Swap the R: for vous swap r for z (préparez); for nous swap r for ons (préparons). Silent ent: the ils/elles form sounds the same as je/il/elle — 'ent' is always silent (ils préparent sounds like 'prépare').",
  'b1-present-tense-non-er': "Chop the R + following letters: for -ir/-re verbs, chop the r and any letters after it (attendre → attend, finir → fini). Swap the R: for vous swap r+following for ez (vous attendez); for nous swap for ons (nous attendons).",
  'b1-future-will': "Hook onto the R: form 'will' by hooking the 'have/has' endings onto the r at the end of the infinitive (manger+ai=mangerai, +a=mangera, +ez=mangerez, +ons=mangerons, +ont=mangeront, +as=mangeras). Ray/Ron/Ra: the three ending sounds — Ray (rai/rez = I/you will), Ron (rons/ront = we/they will), Ra (ra/ras = he-she/tu will) — 'Ray, Ron or the Sun God Ra leading you into the future.'",
  'b2-intention-de': "J'ai + noun + de family: all these constructions share one structure — J'ai [noun] de [infinitive]. Literal anchor: 'I have the intention of.' Gateway to the whole PN2 J'ai family.",
  'b2-envie-de': "J'ai + noun + de family: same structure throughout PN2. Literal anchor: 'I have envy of' → I feel like.",
  'b2-peur-de': "J'ai + noun + de family. Literal anchor: 'I have fear of' → I'm scared of.",
  'b2-horreur-de': "J'ai + noun + de family. Literal anchor: 'I have horror of' → I can't stand.",
  'b2-besoin-de': "J'ai + noun + de family. Literal anchor: 'I have need of' → I need.",
  'b2-etais-sur-le-point-de': "Literal anchor: 'I was at the point of' → I was about to.",
  'b2-etais-en-train-de': "Literal anchor: 'I was in the middle of / in the process of' (en train de = in the middle of doing).",
  'b2-a-cause-de-grace-a': "Literal anchors: à cause de = 'at the cause of' → because of; grâce à = 'thanks to'.",
  'b2-imparfait-vs-passe-compose': "Two past tenses rule: passé composé for a single completed instance (I ate there yesterday); imparfait for repeated or ongoing past (I used to eat there every day). Single instance vs. repeated is the key distinction.",
  'b2-time-markers': "Imparfait trigger words: toujours, tous les jours, tous les matins, tous les soirs, tous les ans — these time markers always signal habitual/repeated past and call for the imparfait automatically."
};

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

  // Add teachingDevice field to patterns that are missing it (never overwrites existing)
  for (const pattern of state.patterns) {
    if (pattern.teachingDevice === undefined) {
      pattern.teachingDevice = TEACHING_DEVICES[pattern.id] || '';
      changed = true;
    }
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
