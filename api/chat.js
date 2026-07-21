// Vercel Serverless Function for Gemini AI Chatbot Proxy
export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Parse message body or query
  let message = null;
  if (req.query && req.query.message) {
    message = req.query.message;
  } else if (req.body) {
    if (typeof req.body === 'string') {
      try { message = JSON.parse(req.body).message; } catch(e) {}
    } else if (req.body.message) {
      message = req.body.message;
    }
  }

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  // Read Key from Environment or Client Header/Query
  const apiKey = process.env.GEMINI_API_KEY || (req.query && req.query.key) || req.headers['x-gemini-key'];

  if (!apiKey) {
    return res.status(200).json({
      fallback: true,
      error: 'GEMINI_API_KEY missing in environment variables'
    });
  }

  try {
    // 1. Try Gemini 1.5 Flash
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    const geminiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `You are CarbonIQ AI Copilot, a helpful financial carbon market analyst. Answer the user question concisely in 2-3 sentences max. Focus on EU ETS, California CCA, China CETS, Fit for 55, CBAM, or carbon offset markets.\n\nUser Question: ${message}`
              }
            ]
          }
        ]
      })
    });

    const data = await geminiRes.json();

    if (data.candidates && data.candidates[0] && data.candidates[0].content) {
      const replyText = data.candidates[0].content.parts[0].text;
      return res.status(200).json({ reply: replyText });
    }

    // 2. Fallback to Gemini 1.5 Pro if Flash quota is busy
    const fallbackUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${apiKey}`;
    const fallbackRes = await fetch(fallbackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: `Answer concisely as a carbon market expert: ${message}` }] }]
      })
    });
    const fallbackData = await fallbackRes.json();
    if (fallbackData.candidates && fallbackData.candidates[0]) {
      return res.status(200).json({ reply: fallbackData.candidates[0].content.parts[0].text });
    }

    return res.status(200).json({ fallback: true, geminiError: data });

  } catch (err) {
    return res.status(200).json({ fallback: true, error: err.message });
  }
}
