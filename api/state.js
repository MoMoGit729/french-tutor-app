require('dotenv').config();
const { getState, setState } = require('../lib/storage');

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const state = await getState();
      return res.json(state);
    }
    if (req.method === 'PUT') {
      const incoming = req.body;
      const current = await getState();
      const updated = deepMerge(current, incoming);
      await setState(updated);
      return res.json({ ok: true });
    }
    res.status(405).end();
  } catch (e) {
    console.error('State error:', e);
    res.status(500).json({ error: e.message });
  }
};

function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}
