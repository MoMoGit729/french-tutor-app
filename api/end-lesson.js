require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const { buildSystemPrompt } = require('../lib/prompt');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const { messages, state } = req.body;
    if (!messages || !state) return res.status(400).json({ error: 'messages and state required' });
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const endMessages = [
      ...messages,
      {
        role: 'user',
        content: "The lesson is ending now. Output the CHECKPOINT block first, then your coach's note — exactly as specified in your instructions."
      }
    ];
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: buildSystemPrompt(state),
      messages: endMessages
    });
    const text = response.content[0].text;
    const summary = text.replace(/:::CHECKPOINT:::[\s\S]*?:::CHECKPOINT:::/, '').trim();
    res.json({ reply: text, summary });
  } catch (e) {
    console.error('End lesson error:', e);
    res.status(500).json({ error: e.message || 'API call failed' });
  }
};
