// Vercel Serverless Function for Gemini AI Chatbot Proxy
export default async function handler(req, res) {
  // Enforce CORS security headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { message } = req.body || {};

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.warn('GEMINI_API_KEY is missing in process.env');
    return res.status(200).json({
      fallback: true,
      reason: 'GEMINI_API_KEY missing in environment'
    });
  }

  // Try calling Gemini 1.5 Flash API
  try {
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `You are CarbonIQ AI Copilot, a world-class financial carbon market analyst. Answer the user's question concisely in 2-3 sentences max. Focus on EU ETS, California CCA, China CETS, Fit for 55, CBAM, or CCM vs VCM.\n\nUser Question: ${message}`
              }
            ]
          }
        ]
      })
    });

    const data = await response.json();

    if (data.candidates && data.candidates[0] && data.candidates[0].content) {
      const replyText = data.candidates[0].content.parts[0].text;
      return res.status(200).json({ reply: replyText });
    } else {
      console.error('Gemini API Error Response:', data);
      return res.status(200).json({ fallback: true, error: data });
    }
  } catch (error) {
    console.error('Gemini Fetch Exception:', error);
    return res.status(200).json({ fallback: true, error: error.message });
  }
}
