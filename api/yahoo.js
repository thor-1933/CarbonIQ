const https = require('https');

module.exports = function handler(req, res) {
    const symbol = req.query.symbol || 'CO2.MI';
    const range = req.query.range || '1d';
    const interval = req.query.interval || '5m';
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=${range}&interval=${interval}&includePrePost=false`;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const options = {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
    };

    https.get(url, options, (yahooRes) => {
        let body = '';
        yahooRes.on('data', (chunk) => {
            body += chunk;
        });
        yahooRes.on('end', () => {
            try {
                if (yahooRes.statusCode !== 200) {
                    return res.status(yahooRes.statusCode).json({ error: `Yahoo returned HTTP ${yahooRes.statusCode}` });
                }
                const data = JSON.parse(body);
                return res.status(200).json(data);
            } catch (e) {
                return res.status(500).json({ error: 'Failed to parse response: ' + e.message });
            }
        });
    }).on('error', (err) => {
        return res.status(500).json({ error: err.message });
    });
};
