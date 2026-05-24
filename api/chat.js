require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const { buildSystemPrompt } = require('../lib/prompt');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const { messages, state } = req.body;
    if (!messages || !state) return res.status(400).json({ error: 'messages and state required' });
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: buildSystemPrompt(state),
      messages
    });
    res.json({ reply: response.content[0].text });
  } catch (e) {
    console.error('Chat error:', e);
    res.status(500).json({ error: e.message || 'API call failed' });
  }
};
