// ─── DATA API & STATISTICAL HELPERS ───

// ─── CORS PROXIES ───────────────────────────────────────────────────
    const CORS_PROXIES = [
        // Vercel Serverless Proxy - bypassed CORS and is extremely fast on deployment
        (url) => {
            try {
                const u = new URL(url);
                const parts = u.pathname.split('/');
                const sym = parts[parts.length - 1] || 'CO2.MI';
                const r = u.searchParams.get('range') || '1d';
                const iv = u.searchParams.get('interval') || '5m';
                return `/api/yahoo?symbol=${sym}&range=${r}&interval=${iv}`;
            } catch(e) {
                return '/api/yahoo?symbol=CO2.MI&range=1d&interval=5m';
            }
        },
        // corsproxy.io - extremely reliable and fast public proxy
        (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
        // Cloudflare-cached allorigins JSON wrap (backup)
        (url) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
        // allorigins raw (backup)
        (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
        // codetabs (backup)
        (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`
    ];

    // Call init and start update ticker loop
    (async function initTicker() {
        buildTicker();
        await updateTickerData();
        setInterval(updateTickerData, 30000);
    })();

    let lastKnownGood = null;

    async function fetchYahooFinanceData(range, interval, symbol = 'CO2.MI') {
        const yahooUrl =
            `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=${range}&interval=${interval}&includePrePost=false`;

        for (let i = 0; i < CORS_PROXIES.length; i++) {
            const proxyUrl = CORS_PROXIES[i](yahooUrl);
            try {
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Request timed out')), 8000)
                );
                const response = await Promise.race([
                    fetch(proxyUrl),
                    timeoutPromise
                ]);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);

                const raw = await response.text();
                let json;
                try {
                    const parsedOuter = JSON.parse(raw);
                    json = (parsedOuter && typeof parsedOuter.contents === 'string') ?
                        JSON.parse(parsedOuter.contents) : parsedOuter;
                } catch (parseErr) {
                    throw new Error('Unparseable proxy response');
                }

                const result = json && json.chart && json.chart.result && json.chart.result[0];
                if (!result) throw new Error('No result in response');
                if (json.chart.error) throw new Error(json.chart.error.description || 'Yahoo returned an error');

                const meta = result.meta || {};
                const timestamps = result.timestamp || [];
                const quotes = (result.indicators && result.indicators.quote && result.indicators.quote[0]) || {};
                const closePrices = quotes.close || [];

                const points = [];
                let latestOpen = null,
                    latestHigh = null,
                    latestLow = null;
                for (let j = 0; j < timestamps.length; j++) {
                    const price = closePrices[j];
                    if (price !== null && price !== undefined && !isNaN(price)) {
                        const ts = timestamps[j] * 1000;
                        points.push({
                            x: ts,
                            y: price,
                            open: (quotes.open && quotes.open[j] !== null) ? quotes.open[j] : price,
                            high: (quotes.high && quotes.high[j] !== null) ? quotes.high[j] : price,
                            low: (quotes.low && quotes.low[j] !== null) ? quotes.low[j] : price,
                            close: price
                        });
                        if (quotes.high && quotes.high[j] !== null) {
                            if (latestHigh === null || quotes.high[j] > latestHigh) latestHigh = quotes.high[j];
                        }
                        if (quotes.low && quotes.low[j] !== null) {
                            if (latestLow === null || quotes.low[j] < latestLow) latestLow = quotes.low[j];
                        }
                        if (latestOpen === null && quotes.open && quotes.open[j] !== null) latestOpen = quotes.open[j];
                    }
                }

                let latestPrice = points.length > 0 ? points[points.length - 1].y : null;
                if (latestPrice === null || latestPrice === undefined) {
                    if (meta.regularMarketPrice !== undefined && meta.regularMarketPrice !== null) {
                        latestPrice = meta.regularMarketPrice;
                    }
                }
                if (latestOpen === null) latestOpen = (meta.regularMarketOpen !== undefined) ? meta.regularMarketOpen : null;
                if (latestHigh === null) latestHigh = (meta.regularMarketDayHigh !== undefined) ? meta.regularMarketDayHigh : null;
                if (latestLow === null) latestLow = (meta.regularMarketDayLow !== undefined) ? meta.regularMarketDayLow : null;

                if (latestPrice === null || latestPrice === undefined || isNaN(latestPrice)) {
                    throw new Error('No price data available');
                }

                if (points.length < 2) {
                    throw new Error('Not enough chart data returned by Yahoo to draw a line chart.');
                }

                lastKnownGood = {
                    price: latestPrice,
                    open: latestOpen,
                    high: latestHigh,
                    low: latestLow,
                    previousClose: meta.previousClose || null,
                    ts: Date.now(),
                };

                return {
                    points: points,
                    latestPrice: latestPrice,
                    previousClose: meta.previousClose || null,
                    open: latestOpen,
                    high: latestHigh,
                    low: latestLow,
                    success: true
                };
            } catch (err) {
                console.warn(`CORS proxy ${i + 1}/${CORS_PROXIES.length} failed:`, err.message || err);
            }
        }

        console.warn('All CORS proxies failed — using fallback data.');
        return generateFallbackData(range, symbol);
    }

    function generateFallbackData(range, symbol = 'CO2.MI') {
        const now = Date.now();
        const map = {
            '1d': { points: 60, interval: 60000 },
            '7d': { points: 100, interval: 3600000 },
            '1mo': { points: 90, interval: 28800000 },
            '3mo': { points: 90, interval: 86400000 },
            '1y': { points: 52, interval: 604800000 },
            'max': { points: 100, interval: 2592000000 }
        };
        let key = '1mo';
        if (range.includes('1d')) key = '1d';
        else if (range.includes('7d') || range.includes('5d')) key = '7d';
        else if (range.includes('1mo')) key = '1mo';
        else if (range.includes('3mo')) key = '3mo';
        else if (range.includes('1y')) key = '1y';
        else if (range.includes('max')) key = 'max';
        const cfg = map[key] || map['1mo'];

        let defaultAnchor = 63.45;
        if (symbol === 'KCCA') {
            defaultAnchor = 14.80;
        } else if (symbol === '3060.HK') {
            defaultAnchor = 68.50;
        }
        
        const basePrice = (typeof TICKER_FALLBACKS !== 'undefined' && TICKER_FALLBACKS[symbol]) ? TICKER_FALLBACKS[symbol].price : defaultAnchor;
        const anchor = (lastKnownGood && currentDashboardSymbol === symbol) ? lastKnownGood.price : basePrice;
        
        const points = [];
        
        let noiseFactor = 0.12;
        if (symbol === 'KCCA') noiseFactor = 0.08;
        else if (symbol === '3060.HK') noiseFactor = 0.09;

        let currentPrice = anchor;
        const backwardsPoints = [];
        
        for (let i = 0; i < cfg.points; i++) {
            const ts = now - i * cfg.interval;
            const o = currentPrice + (Math.random() - 0.5) * 0.08;
            const h = Math.max(o, currentPrice) + Math.random() * 0.15;
            const l = Math.min(o, currentPrice) - Math.random() * 0.15;
            
            backwardsPoints.push({ x: ts, y: currentPrice, open: o, high: h, low: l, close: currentPrice });
            
            const drift = (symbol === 'CO2.MI' ? -0.01 : (symbol === 'KCCA' ? 0.005 : -0.003));
            currentPrice += (Math.random() - 0.5) * noiseFactor + drift;
            currentPrice = Math.max(anchor - 4, Math.min(anchor + 4, currentPrice));
        }
        
        backwardsPoints.reverse().forEach(pt => points.push(pt));
        const latest = points[points.length - 1];
        const prevCloseFallback = lastKnownGood && lastKnownGood.previousClose ? lastKnownGood.previousClose :
            (points.length > 1 ? points[0].close : latest.close);
        return {
            points: points,
            latestPrice: latest.close,
            previousClose: prevCloseFallback,
            open: points[0] ? points[0].open : latest.open,
            high: Math.max.apply(null, points.map(p => p.high)),
            low: Math.min.apply(null, points.map(p => p.low)),
            success: false,
            isFallback: true
        };
    }

    // ─── MARKET HOURS ──────────────────────────────────────────────────
    const MARKET_CONFIGS = {
        'CO2.MI': {
            exchange: 'Borsa Italiana',
            hoursLabel: '09:00–17:30 CET/CEST · Mon–Fri',
            openMin: 9 * 60,
            closeMin: 17 * 60 + 30,
            timezone: 'Europe/Rome',
            tzLabel: 'CET/CEST',
            clockLabel: 'Milan time now'
        },
        'KCCA': {
            exchange: 'NYSE Arca',
            hoursLabel: '09:30–16:00 EST/EDT · Mon–Fri',
            openMin: 9 * 60 + 30,
            closeMin: 16 * 60,
            timezone: 'America/New_York',
            tzLabel: 'EST/EDT',
            clockLabel: 'New York time now'
        },
        '3060.HK': {
            exchange: 'HKEX',
            hoursLabel: '09:30–16:00 HKT · Mon–Fri',
            openMin: 9 * 60 + 30,
            closeMin: 16 * 60,
            timezone: 'Asia/Hong_Kong',
            tzLabel: 'HKT',
            clockLabel: 'Hong Kong time now'
        }
    };
    var WEEKDAY_ORDER = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    function getMarketTimeNow(tz) {
        var parts = new Intl.DateTimeFormat('en-GB', {
            timeZone: tz,
            weekday: 'short',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
        }).formatToParts(new Date());
        var map = {};
        parts.forEach(function(p) { map[p.type] = p.value; });
        return {
            weekday: map.weekday,
            hour: parseInt(map.hour, 10),
            minute: parseInt(map.minute, 10),
            second: parseInt(map.second, 10),
        };
    }

    function getMarketStatus() {
        const config = MARKET_CONFIGS[currentDashboardSymbol] || MARKET_CONFIGS['CO2.MI'];
        var now = getMarketTimeNow(config.timezone);
        var minutesNow = now.hour * 60 + now.minute;
        var isWeekend = (now.weekday === 'Sat' || now.weekday === 'Sun');
        var isOpen = !isWeekend && minutesNow >= config.openMin && minutesNow < config.closeMin;

        var clockStr = String(now.hour).padStart(2, '0') + ':' + String(now.minute).padStart(2, '0') + ':' + String(now.second).padStart(2, '0');

        var nextEvent = '';
        if (isOpen) {
            var minsToClose = config.closeMin - minutesNow;
            var h = Math.floor(minsToClose / 60),
                m = minsToClose % 60;
            nextEvent = 'Closes in ' + (h > 0 ? h + 'h ' : '') + m + 'm';
        } else {
            var dayIdx = WEEKDAY_ORDER.indexOf(now.weekday);
            var minutesUntilMidnight = (24 * 60) - minutesNow;
            var minsToOpenToday = config.openMin - minutesNow;
            if (!isWeekend && minsToOpenToday > 0) {
                var h2 = Math.floor(minsToOpenToday / 60),
                    m2 = minsToOpenToday % 60;
                nextEvent = 'Opens in ' + (h2 > 0 ? h2 + 'h ' : '') + m2 + 'm';
            } else {
                var totalMins = minutesUntilMidnight;
                var candidateIdx = (dayIdx + 1) % 7;
                while (candidateIdx === 0 || candidateIdx === 6) {
                    totalMins += 24 * 60;
                    candidateIdx = (candidateIdx + 1) % 7;
                }
                totalMins += config.openMin;
                var hh = Math.floor(totalMins / 60),
                    mm = totalMins % 60;
                nextEvent = 'Opens in ' + hh + 'h ' + mm + 'm (' + WEEKDAY_ORDER[candidateIdx] + ')';
            }
        }

        return { isOpen: isOpen, clockStr: clockStr, nextEvent: nextEvent, weekday: now.weekday, tzLabel: config.tzLabel };
    }

    function updateMarketStatusUI() {
        var status = getMarketStatus();
        var dot = document.getElementById('marketStatusDot');
        var label = document.getElementById('marketStatusLabel');
        var clock = document.getElementById('marketMilanClock');
        var next = document.getElementById('marketNextEvent');
        var liveBadge = document.getElementById('dashLiveBadge');
        const config = MARKET_CONFIGS[currentDashboardSymbol] || MARKET_CONFIGS['CO2.MI'];

        var exLabel = document.getElementById('marketExchangeLabel');
        if (exLabel) exLabel.textContent = config.exchange + ' · ' + config.hoursLabel;

        var clLabel = document.getElementById('marketClockLabel');
        if (clLabel) clLabel.textContent = config.clockLabel;

        if (clock) clock.textContent = status.clockStr + ' ' + status.tzLabel;
        if (next) next.textContent = status.nextEvent;

        const specTime = document.getElementById('specTime');
        if (specTime) specTime.textContent = status.clockStr + ' ' + status.tzLabel;

        if (status.isOpen) {
            if (dot) { dot.style.background = '';
                dot.classList.remove('ms-closed'); }
            if (label) { label.textContent = 'Market Open';
                label.style.color = 'var(--teal)'; }
            if (liveBadge) { liveBadge.textContent = '● Live';
                liveBadge.className = 'section-badge badge-live'; }
        } else {
            if (dot) { dot.style.background = '';
                dot.classList.add('ms-closed'); }
            if (label) { label.textContent = 'Market Closed';
                label.style.color = 'var(--amber)'; }
            if (liveBadge) { liveBadge.textContent = '● Market Closed';
                liveBadge.className = 'section-badge badge-warn'; }
        }

        // Keep active count updated in real-time
        if (typeof updateMarketOverviewMetrics === 'function') {
            updateMarketOverviewMetrics();
        }
    }

    // ─── STATS HELPERS ──────────────────────────────────────────────────
    function computeRangeStats(data) {
        const points = data.points || [];
        if (points.length === 0) return null;
        const opens = points.map(p => p.open).filter(v => v !== null && v !== undefined && !isNaN(v));
        const highs = points.map(p => p.high).filter(v => v !== null && v !== undefined && !isNaN(v));
        const lows = points.map(p => p.low).filter(v => v !== null && v !== undefined && !isNaN(v));
        const open = opens.length ? opens[0] : points[0].y;
        const high = highs.length ? Math.max.apply(null, highs) : Math.max.apply(null, points.map(p => p.y));
        const low = lows.length ? Math.min.apply(null, lows) : Math.min.apply(null, points.map(p => p.y));
        const close = data.latestPrice;
        const prevClose = (data.previousClose !== null && data.previousClose !== undefined) ? data.previousClose : open;
        return { open: open, high: high, low: low, close: close, prevClose: prevClose };
    }

    function fmtDashCurrency(v) {
        if (v === null || v === undefined || isNaN(v)) return '—';
        const symbol = currentDashboardSymbol;
        const ticker = MARKET_TICKERS[symbol];
        if (!ticker) return '$' + v.toFixed(2);
        
        const displayVal = getPriceInDisplayCurrency(v, symbol);
        let prefix = '$';
        if (ticker.displayCurrency === 'EUR') prefix = '€';
        else if (ticker.displayCurrency === 'CNY') prefix = '¥';
        
        return prefix + displayVal.toFixed(2);
    }

    function updateDashStats(data) {
        const stats = computeRangeStats(data);
        if (!stats) return;
        currentPrevClose = stats.prevClose;

        const change = stats.close - stats.prevClose;
        const changePct = stats.prevClose ? (change / stats.prevClose) * 100 : 0;
        const tone = change > 0 ? 'pos' : change < 0 ? 'neg' : 'neu';
        const arrow = change > 0 ? '▲' : change < 0 ? '▼' : '•';
        const sign = change > 0 ? '+' : '';

        const curEl = document.getElementById('statCurrentPrice');
        const chgEl = document.getElementById('statChange');
        const prevEl = document.getElementById('statPrevClose');
        const openEl = document.getElementById('statOpen');
        const highEl = document.getElementById('statHigh');
        const lowEl = document.getElementById('statLow');

        const priceHeaderVal = document.getElementById('dashPriceHeaderVal');
        const ohlcOpen = document.getElementById('dashOHLCOpen');
        const ohlcHigh = document.getElementById('dashOHLCHigh');
        const ohlcLow = document.getElementById('dashOHLCLow');
        const ohlcVol = document.getElementById('dashOHLCVol');

        const displayHeaderPrice = fmtDashCurrency(stats.close);
        const displayHeaderChange = sign + change.toFixed(2) + ' (' + sign + changePct.toFixed(2) + '%)';

        if (priceHeaderVal) {
            priceHeaderVal.innerHTML = displayHeaderPrice + ' <span style="font-size:12px; font-weight:600; margin-left:6px;" class="' + tone + '">' + (change >= 0 ? '▲ ' : '▼ ') + displayHeaderChange + '</span>';
        }
        if (ohlcOpen) ohlcOpen.textContent = fmtDashCurrency(stats.open);
        if (ohlcHigh) ohlcHigh.textContent = fmtDashCurrency(stats.high);
        if (ohlcLow) ohlcLow.textContent = fmtDashCurrency(stats.low);
        
        const metadata = ASSET_METADATA[currentDashboardSymbol] || { volume: '0.00M lots' };
        if (ohlcVol) ohlcVol.textContent = metadata.volume;

        if (curEl) { curEl.textContent = fmtDashCurrency(stats.close);
            curEl.className = 'stat-val ' + tone; }
        if (chgEl) { chgEl.textContent = arrow + ' ' + sign + change.toFixed(2) + ' (' + sign + changePct.toFixed(2) + '%)';
            chgEl.className = 'stat-chg ' + tone; }
        if (prevEl) prevEl.textContent = fmtDashCurrency(stats.prevClose);
        if (openEl) openEl.textContent = fmtDashCurrency(stats.open);
        if (highEl) highEl.textContent = fmtDashCurrency(stats.high);
        if (lowEl) lowEl.textContent = fmtDashCurrency(stats.low);

        const fco2Ticks = document.querySelectorAll('.tick[data-key="fco2"]');
        fco2Ticks.forEach(function(el) {
            var valEl = el.querySelector('.tick-val');
            var tchgEl = el.querySelector('.tick-chg');
            valEl.textContent = fmtDashCurrency(stats.close);
            tchgEl.textContent = arrow + ' ' + sign + changePct.toFixed(2) + '%';
            valEl.className = 'tick-val ' + tone;
            tchgEl.className = 'tick-chg ' + tone;
        });
        if (stats.close) {
            holdingsPrices[currentDashboardSymbol] = stats.close;
            holdingsChanges[currentDashboardSymbol] = changePct;
            updateHoldingsTable();
        }

        // Update currency conversions dynamically in real-time
        if (typeof onEuaPriceUpdate === 'function') {
            onEuaPriceUpdate();
        }
    }

// ─── LIVE FX CURRENCY CONVERTER ────────────────────────────────────
    var _fxRates = null;
    var _fxLastFetch = 0;
    var _fxRefreshTimer = null;

    // Currencies to display: [code, flag, display-name, symbol, decimals]
    var FX_CURRENCIES = [
        ['USD', '🇺🇸', 'US Dollar',       '$',   2],
        ['INR', '🇮🇳', 'Indian Rupee',     '₹',   2],
        ['CNY', '🇨🇳', 'Chinese Yuan',     '¥',   2],
        ['GBP', '🇬🇧', 'British Pound',    '£',   2],
        ['KWD', '🇰🇼', 'Kuwaiti Dinar',   'KD ', 3],
        ['JPY', '🇯🇵', 'Japanese Yen',     '¥',   0],
        ['AED', '🇦🇪', 'UAE Dirham',       'AED ', 2],
        ['CHF', '🇨🇭', 'Swiss Franc',      'Fr ',  2]
    ];

    function getEuaPrice() {
        // Try to read dashboard live current price first
        var dashEl = document.getElementById('statCurrentPrice');
        if (dashEl) {
            var raw = dashEl.textContent.replace(/[^\d.]/g, '');
            var val = parseFloat(raw);
            if (!isNaN(val) && val > 0) return val;
        }
        // Fall back to landing page price
        const isEua = currentDashboardSymbol === 'CO2.MI';
        var el = document.getElementById(isEua ? 'geo-eua-price' : 'geo-cca-price');
        if (el) {
            var raw = el.textContent.replace(/[^\d.]/g, '');
            var val = parseFloat(raw);
            if (!isNaN(val) && val > 0) return val;
        }
        return isEua ? 63.45 : 14.80;
    }

    function fmtNum(n, decimals) {
        return n.toLocaleString('en-US', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        });
    }

    function onFxInputUpdate() {
        if (!_fxRates) return;
        var select = document.getElementById('dashFxSelect');
        var input = document.getElementById('dashFxInput');
        var resultEl = document.getElementById('dashFxResult');
        var rateTextEl = document.getElementById('dashFxRateText');
        var labelEl = document.getElementById('dashFxEurLabel');
        if (!select || !input || !resultEl) return;

        var amount = parseFloat(input.value);
        if (isNaN(amount) || amount <= 0) amount = 1;

        var code = select.value;
        var cur = FX_CURRENCIES.find(function(c) { return c[0] === code; });
        if (!cur) return;

        var flag = cur[1];
        var sym = cur[3];
        var dec = cur[4];
        var rate = _fxRates[code];
        if (!rate) return;

        var euaEur = getEuaPrice();
        const baseSym = currentDashboardSymbol === 'CO2.MI' ? '€' : '$';
        if (labelEl) labelEl.textContent = baseSym + fmtNum(euaEur, 2);

        var convertedVal = euaEur * rate * amount;
        resultEl.textContent = sym + fmtNum(convertedVal, dec);
        if (rateTextEl) {
            const baseLabel = currentDashboardSymbol === 'CO2.MI' ? 'EUR' : 'USD';
            const creditLabel = currentDashboardSymbol === 'CO2.MI' ? 'EUA' : 'KCCA';
            rateTextEl.textContent = '1 ' + baseLabel + ' = ' + sym + fmtNum(rate, dec) + ' · 1 ' + creditLabel + ' = ' + sym + fmtNum(euaEur * rate, dec);
        }

        // Update Quick Reference List
        var quickRef = document.getElementById('dashFxQuickRef');
        if (quickRef) {
            var qhtml = '';
            var addedCount = 0;
            FX_CURRENCIES.forEach(function(c) {
                var ccode = c[0];
                if (ccode === code) return; // skip active select
                var cflag = c[1];
                var cname = c[2];
                var csym = c[3];
                var cdec = c[4];
                var crate = _fxRates[ccode];
                if (!crate) return;
                var csingleVal = euaEur * crate;
                if (addedCount > 0) qhtml += '<div style="height:1px;background:rgba(255,255,255,0.03);margin:0 6px"></div>';
                qhtml += '<div class="dash-fx-quick-row">' +
                    '<div class="dash-fx-quick-left">' +
                        '<span class="dash-fx-quick-flag">' + cflag + '</span>' +
                        '<span class="dash-fx-quick-code">' + ccode + '</span>' +
                        '<span class="dash-fx-quick-name">' + cname + '</span>' +
                    '</div>' +
                    '<div class="dash-fx-quick-val">' + csym + fmtNum(csingleVal, cdec) + '</div>' +
                '</div>';
                addedCount++;
            });
            quickRef.innerHTML = qhtml;
        }
    }

    function renderFXList(rates, euaEur) {
        // ── Landing page sidebar panel ──
        var list = document.getElementById('fxList');
        if (list) {
            var baseEl = document.getElementById('fxEuaEur');
            const baseSym = currentDashboardSymbol === 'CO2.MI' ? '€' : '$';
            if (baseEl) baseEl.textContent = baseSym + fmtNum(euaEur, 2);
            var html = '';
            FX_CURRENCIES.forEach(function(cur) {
                var code = cur[0]; var flag = cur[1]; var name = cur[2];
                var sym  = cur[3]; var dec  = cur[4];
                var rate = rates[code];
                if (!rate) return;
                var euaVal = euaEur * rate;
                html += '<div class="fx-row">' +
                    '<span class="fx-flag">' + flag + '</span>' +
                    '<div class="fx-info">' +
                        '<div class="fx-name">' + name + ' <span style="color:var(--t4);font-weight:400">(' + code + ')</span></div>' +
                        '<div class="fx-rate-sub">1 EUR = ' + sym + fmtNum(rate, dec) + '</div>' +
                    '</div>' +
                    '<div class="fx-converted">' +
                        '<div class="fx-converted-val">' + sym + fmtNum(euaVal, dec) + '</div>' +
                        '<div class="fx-rate-label">per EUA credit</div>' +
                    '</div>' +
                '</div>';
            });
            list.innerHTML = html;
        }

        // ── Dashboard Calculator ──
        var select = document.getElementById('dashFxSelect');
        if (select) {
            var curVal = select.value;
            if (select.options.length === 0) {
                // Populate dropdown option elements
                var optionsHtml = '';
                FX_CURRENCIES.forEach(function(cur) {
                    optionsHtml += '<option value="' + cur[0] + '">' + cur[1] + ' ' + cur[2] + ' (' + cur[0] + ')</option>';
                });
                select.innerHTML = optionsHtml;
                select.value = 'USD'; // default to USD
            } else if (curVal) {
                select.value = curVal; // preserve choice
            }
            onFxInputUpdate();
        }
    }

    // FX proxy list - try direct first, then fallback to Cloudflare-cached allorigins get endpoint
    var FX_PROXIES = [
        function(u) { return u; },  // direct fetch (fast & supports CORS)
        // allorigins JSON wrap (Cloudflare cached, extremely fast and reliable)
        function(u) { return 'https://api.allorigins.win/get?url=' + encodeURIComponent(u); },
        // allorigins raw (uncached backup)
        function(u) { return 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u); }
    ];

    async function fetchFXRates() {
        var btn = document.getElementById('fxRefreshBtn');
        var updEl = document.getElementById('fxUpdated');
        if (btn) btn.classList.add('spinning');
        var dashBtn2 = document.getElementById('dashFxRefBtn');
        if (dashBtn2) dashBtn2.classList.add('spinning');

        var codes = FX_CURRENCIES.map(function(c) { return c[0]; }).join(',');
        const baseCurrency = currentDashboardSymbol === 'CO2.MI' ? 'EUR' : 'USD';
        var fxUrl = 'https://open.er-api.com/v6/latest/' + baseCurrency;

        var lastErr = null;
        for (var i = 0; i < FX_PROXIES.length; i++) {
            var proxyUrl = FX_PROXIES[i](fxUrl);
            try {
                var timeoutP = new Promise(function(_, rej) {
                    setTimeout(function() { rej(new Error('Timeout')); }, 12000);
                });
                var response = await Promise.race([
                    fetch(proxyUrl, { headers: { 'Accept': 'application/json' } }),
                    timeoutP
                ]);
                if (!response.ok) throw new Error('HTTP ' + response.status);

                var raw = await response.text();
                var data;
                try {
                    var parsed = JSON.parse(raw);
                    // allorigins wraps JSON in {contents: "..."}
                    data = (parsed && typeof parsed.contents === 'string')
                        ? JSON.parse(parsed.contents)
                        : parsed;
                } catch(e) {
                    throw new Error('Bad JSON from proxy');
                }

                if (!data || !data.rates) throw new Error('No rates in response');

                // SUCCESS
                _fxRates = data.rates;
                _fxLastFetch = Date.now();
                var euaEur = getEuaPrice();
                renderFXList(_fxRates, euaEur);
                if (updEl) {
                    var now = new Date();
                    updEl.textContent = 'ECB rates · Updated ' + now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');
                }
                if (_fxRefreshTimer) clearTimeout(_fxRefreshTimer);
                _fxRefreshTimer = setTimeout(fetchFXRates, 60000);
                // stop trying proxies
                break;

            } catch(err) {
                lastErr = err;
                console.warn('FX proxy ' + (i+1) + '/' + FX_PROXIES.length + ' failed:', err.message);
            }
        }

        if (!_fxRates) {
            // All proxies failed
            var showErr = function(id) {
                var el = document.getElementById(id);
                if (el) el.innerHTML = '<div class="fx-error">Could not load live rates.<br><small>Check internet connection</small></div>';
            };
            showErr('fxList');
            showErr('dashFxList');
            if (updEl) updEl.textContent = 'Rates unavailable';
            if (_fxRefreshTimer) clearTimeout(_fxRefreshTimer);
            _fxRefreshTimer = setTimeout(fetchFXRates, 30000);
        }

        if (btn) btn.classList.remove('spinning');
        var dashBtn3 = document.getElementById('dashFxRefBtn');
        if (dashBtn3) dashBtn3.classList.remove('spinning');
    }

    // Called whenever EUA price updates (hooked into live price feed)
    function onEuaPriceUpdate() {
        if (_fxRates) {
            renderFXList(_fxRates, getEuaPrice());
        }
    }
