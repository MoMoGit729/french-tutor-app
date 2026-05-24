require('dotenv').config();
const { getState, setState } = require('../lib/storage');

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const state = await getState();
      return res.json(state);
    }
    if (req.method === 'PUT') {
      let body = req.body;
      if (!body) return res.status(400).json({ error: 'No body' });
      if (typeof body === 'string') body = JSON.parse(body);
      await setState(body);
      return res.json({ ok: true });
    }
    res.status(405).end();
  } catch (e) {
    console.error('State error:', e);
    res.status(500).json({ error: e.message });
  }
};
