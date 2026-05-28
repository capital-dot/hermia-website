// =====================================================================
//  HERMIA BACKEND for VERCEL  —  file path in your repo:  /api/chat.js
//  Vercel automatically turns any file in the /api folder into a live
//  endpoint. So this file becomes:  https://yoursite.com/api/chat
//
//  Your API key stays SECRET here — visitors never see it.
// =====================================================================

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { system, messages } = req.body;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,   // set this in Vercel, not in code
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 600,
        system: system,
        messages: messages
      })
    });

    const data = await response.json();

    const reply = (data.content && data.content[0] && data.content[0].text)
      ? data.content[0].text
      : "Sorry, I didn't catch that — could you rephrase?";

    return res.status(200).json({ reply });

  } catch (err) {
    console.error('Hermia backend error:', err);
    return res.status(500).json({ reply: "I'm having trouble connecting right now. Please try again shortly." });
  }
}
