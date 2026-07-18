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

  const apiKey = '8203ca35fa43ce8d6354bef20fb133a0';
  const query = 'carbon OR "carbon credits" OR "carbon permits" OR emissions OR "climate change" OR "net zero" OR decarbonization';
  const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(query)}&lang=en&sortBy=publishedAt&apikey=${apiKey}`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    console.error('Error fetching news:', error);
    res.status(500).json({ errors: ['Failed to fetch news from source'] });
  }
}
