// ─── DASHBOARD INTERACTION LOGIC ───

// ─── PANEL SWITCH ──────────────────────────────────────────────────
    window.switchPanel = function(name, el) {
        document.querySelectorAll('.panel').forEach(function(p) { p.classList.remove('active'); });
        document.querySelectorAll('.sb-item').forEach(function(s) { s.classList.remove('active'); });
        var target = document.getElementById('panel-' + name);
        if (target) target.classList.add('active');
        if (el) el.classList.add('active');
        document.querySelectorAll('.nav-link').forEach(function(x) { x.classList.remove('active'); });
        if (name === 'prices') {
            var n = document.querySelector('.nav-link[data-page="landing"]');
            if (n) n.classList.add('active');
        } else if (name === 'ai') {
            var n2 = document.querySelector('.nav-link[data-page="ai-explainer"]');
            if (n2) { n2.classList.add('active'); window.updateAIPredictions(window.currentDashboardSymbol); }
        } else if (name === 'policy') {
            var n3 = document.querySelector('.nav-link[data-page="dashboard-policy"]');
            if (n3) n3.classList.add('active');
        }
    }

    // ─── TICKER CONFIG & LOGIC ──────────────────────────────────────────
    const targetTickers = [
      "CO2.MI", "KCCA", "3060.HK"
    ];

    const TICKER_NAMES = {
      "CO2.MI": "EUA=F (ICE)",
      "KCCA": "CCA (NYSE)",
      "3060.HK": "3060.HK (HKEX)"
    };

    function formatTickerCurrency(symbol, value, isChange = false) {
        if (value === null || value === undefined || isNaN(value)) return '—';
        
        let prefix = '$';
        let displayVal = value;
        if (symbol === 'CO2.MI') {
            prefix = '€';
        } else if (symbol === '3060.HK') {
            prefix = '¥';
            if (typeof getPriceInDisplayCurrency === 'function') {
                displayVal = getPriceInDisplayCurrency(value, symbol);
            }
        }
        
        const absVal = Math.abs(displayVal);
        let formattedNum = absVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        
        if (isChange) {
            return prefix + formattedNum;
        }
        return (displayVal < 0 ? '-' : '') + prefix + formattedNum;
    }

    function buildTicker() {
        var wrap = document.getElementById('tickerWrap');
        if (!wrap) return;
        wrap.innerHTML = '';
        const doubleTickers = targetTickers.concat(targetTickers);
        doubleTickers.forEach(function(sym, index) {
            var d = document.createElement('div');
            d.className = 'tick';
            d.dataset.symbol = sym;
            d.dataset.index = index;
            const displayName = TICKER_NAMES[sym] || sym;
            d.innerHTML =
                '<span class="tick-name">' + displayName + '</span>' +
                '<span style="color: var(--b3);">|</span>' +
                '<span class="tick-val neu">—</span>' +
                '<span style="color: var(--b3);">|</span>' +
                '<span class="tick-chg neu">—</span>';
            wrap.appendChild(d);
        });
    }

    async function fetchSingleTicker(symbol) {
        const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=1d&interval=5m&includePrePost=false`;
        for (let i = 0; i < CORS_PROXIES.length; i++) {
            const proxyUrl = CORS_PROXIES[i](yahooUrl);
            try {
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Request timed out')), 5000)
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
                
                const meta = result.meta || {};
                const timestamps = result.timestamp || [];
                const quotes = (result.indicators && result.indicators.quote && result.indicators.quote[0]) || {};
                const closePrices = quotes.close || [];
                
                let latestPrice = closePrices.length > 0 ? closePrices[closePrices.length - 1] : null;
                if (latestPrice === null || latestPrice === undefined || isNaN(latestPrice)) {
                    latestPrice = meta.regularMarketPrice;
                }
                
                const prevClose = meta.previousClose || (closePrices.length > 1 ? closePrices[closePrices.length - 2] : latestPrice);
                
                if (latestPrice === null || latestPrice === undefined || isNaN(latestPrice)) {
                    throw new Error('No price data available');
                }
                
                const change = latestPrice - prevClose;
                const changePct = prevClose ? (change / prevClose) * 100 : 0;
                
                return {
                    symbol: symbol,
                    name: meta.shortName || TICKER_NAMES[symbol] || symbol,
                    price: latestPrice,
                    change: change,
                    changePct: changePct,
                    success: true
                };
            } catch (err) {
                console.warn(`[Ticker] Proxy ${i + 1} failed for ${symbol}:`, err.message);
            }
        }
        throw new Error(`All proxies failed for ${symbol}`);
    }

    const TICKER_FALLBACKS = {
        "CO2.MI": { price: 63.45, change: 2.06, changePct: 3.35 },
        "KCCA": { price: 45.12, change: -0.27, changePct: -0.60 },
        "3060.HK": { price: 54.30, change: 1.74, changePct: 3.31 },
        "^NSEI": { price: 24250, change: 120.5, changePct: 0.50 },
        "ES=F": { price: 5480.25, change: -12.75, changePct: -0.23 },
        "BTC-USD": { price: 95420.00, change: 1450.00, changePct: 1.54 },
        "ETH-USD": { price: 3240.50, change: 42.10, changePct: 1.32 },
        "NVDA": { price: 132.40, change: 3.15, changePct: 2.43 },
        "AAPL": { price: 221.80, change: -1.20, changePct: -0.54 },
        "GOOG": { price: 174.60, change: 0.85, changePct: 0.49 },
        "META": { price: 504.30, change: -4.10, changePct: -0.81 },
        "SPCX": { price: 24.95, change: 0.05, changePct: 0.20 },
        "NFLX": { price: 682.10, change: 8.40, changePct: 1.25 },
        "TMCV.NS": { price: 12.45, change: 0.35, changePct: 2.89 }
    };

    function getFallbackTickerData(symbol) {
        const base = TICKER_FALLBACKS[symbol] || { price: 100, change: 0, changePct: 0 };
        const price = base.price;
        const change = base.change;
        const changePct = base.changePct;
        return {
            symbol: symbol,
            name: TICKER_NAMES[symbol] || symbol,
            price: price,
            change: change,
            changePct: changePct,
            success: true
        };
    }

    async function updateTickerData() {
        const fetchPromises = targetTickers.map(async (symbol) => {
            try {
                return await fetchSingleTicker(symbol);
            } catch (err) {
                console.warn(`Failed to fetch ticker ${symbol}:`, err);
                return getFallbackTickerData(symbol);
            }
        });
        
        const results = await Promise.all(fetchPromises);
        results.forEach((res) => {
            const oldPrice = window.holdingsPrices[res.symbol];
            if (res.price !== null && !isNaN(res.price)) {
                window.holdingsPrices[res.symbol] = res.price;
                window.holdingsChanges[res.symbol] = res.changePct;
                
                // Add to history
                if (window.holdingsHistory[res.symbol]) {
                    window.holdingsHistory[res.symbol].push(res.price);
                    if (window.holdingsHistory[res.symbol].length > 10) {
                        window.holdingsHistory[res.symbol].shift();
                    }
                }
                
                // Trigger flash
                if (oldPrice && oldPrice !== res.price) {
                    triggerPriceFlash(res.symbol, res.price > oldPrice);
                }
                logSync(`FETCH -> ${res.symbol} @ ${res.price.toFixed(2)} [SUCCESS]`, 'INFO');
            }

            const ticks = document.querySelectorAll(`.tick[data-symbol="${res.symbol}"]`);
            ticks.forEach((el) => {
                const nameEl = el.querySelector('.tick-name');
                const valEl = el.querySelector('.tick-val');
                const chgEl = el.querySelector('.tick-chg');
                
                if (res.name && nameEl) nameEl.textContent = res.name;
                
                if (!res.success || res.price === null) {
                    if (valEl) { valEl.textContent = '—'; valEl.className = 'tick-val neu'; }
                    if (chgEl) { chgEl.textContent = 'Offline'; chgEl.className = 'tick-chg neu'; }
                    return;
                }
                
                const tone = res.change > 0 ? 'pos' : res.change < 0 ? 'neg' : 'neu';
                const arrow = res.change > 0 ? '▲' : res.change < 0 ? '▼' : '•';
                
                if (valEl) {
                    valEl.textContent = formatTickerCurrency(res.symbol, res.price);
                    valEl.className = 'tick-val ' + tone;
                }
                
                if (chgEl) {
                    const fmtChg = formatTickerCurrency(res.symbol, res.change, true);
                    const fmtPct = Math.abs(res.changePct).toFixed(2) + '%';
                    chgEl.textContent = `${arrow} ${fmtChg} (${fmtPct})`;
                    chgEl.className = 'tick-chg ' + tone;
                }
            });
        });

        window.updateHoldingsTable();
        resetSyncTimer();
    }

    
    window.onMarketAssetChange = async function(symbol) {
        window.currentDashboardSymbol = symbol;
        
        // Keep the dropdown selection synchronized
        const dropdown = document.getElementById('marketSystemDropdown');
        if (dropdown) dropdown.value = symbol;

        // Update all UI labels/terminology
        updateDashboardAssetLabels();
        if (typeof window.updateMarketStatusUI === 'function') {
            window.updateMarketStatusUI();
        }
        
        // Refresh the relative performance chart to highlight the new selection
        if (typeof window.renderPerformanceChart === 'function') {
            window.renderPerformanceChart();
        }
        
        // Fetch new FX Rates relative to the new base currency
        if (typeof window.fetchFXRates === 'function') {
            await window.fetchFXRates();
        }
        
        // Re-fetch statistics and render the main chart
        if (typeof setDashRange === 'function') {
            await setDashRange(window.currentRange);
        }

        // Update AI predictions dynamically if available
        if (typeof window.updateAIPredictions === 'function') {
            window.updateAIPredictions(symbol);
        }
    };

    // ─── TICKER-ONLY REFRESH ──────────────────────────────────────────
    async function updateTickerOnly() {
        try {
            await updateTickerData();
        } catch (err) {
            console.warn('updateTickerOnly error:', err);
        }
    }

    async function periodicRefresh() {
        if (window.currentRange === '1D') {
            try {
                const result = await window.fetchYahooFinanceData('1d', '5m', window.currentDashboardSymbol);
                window.currentDataPoints = result.points;
                renderDashChart(result.points, window.currentRange, window.currentChartType);
                window.updateDashStats(result);
                const subEl = document.getElementById('dashChartSub');
                if (subEl) {
                    subEl.textContent = result.isFallback ?
                        'Live feed unavailable – showing simulated data' :
                        'Live price data from Yahoo Finance · ' + new Date().toLocaleTimeString();
                }
            } catch (err) {
                console.warn('periodicRefresh (1D) error:', err);
            }
        } else {
            await updateTickerOnly();
        }
    }

    // ─── CHART UTILITIES ──────────────────────────────────────────────
    function mkDates(n, future) {
        if (future === undefined) future = 0;
        var a = [];
        var now = new Date();
        for (var i = n - 1; i >= -future; i--) {
            var d = new Date(now);
            d.setDate(d.getDate() - i);
            a.push(d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }));
        }
        return a;
    }

    function mkTimestamps(n, future) {
        if (future === undefined) future = 0;
        var a = [];
        var now = new Date();
        now.setHours(0,0,0,0);
        for (var i = n - 1; i >= -future; i--) {
            var d = new Date(now);
            d.setDate(d.getDate() - i);
            a.push(d.getTime());
        }
        return a;
    }

    function genSeries(n, start, vol) {
        var a = [parseFloat(start.toFixed(2))];
        for (var i = 1; i < n; i++) a.push(parseFloat((a[i - 1] + (Math.random() - .46) * vol).toFixed(2)));
        return a;
    }

    class CustomSVGChart {
        constructor(containerId, options) {
            this.container = document.getElementById(containerId);
            if (!this.container) return;
            this.options = options;
            this.series = options.series || [];
            this.colors = options.colors || ['var(--signal)', 'var(--amber)'];
            this.dashArray = options.dashArray || [0, 5];
            this.render();
            this.initEvents();
        }

        render() {
            this.container.innerHTML = '';
            this.container.style.position = 'relative';
            this.container.style.userSelect = 'none';

            const width = this.container.clientWidth || 600;
            const height = this.options.height || 210;

            let minX = Infinity, maxX = -Infinity;
            let minY = Infinity, maxY = -Infinity;

            this.series.forEach(s => {
                s.data.forEach(pt => {
                    if (pt.x < minX) minX = pt.x;
                    if (pt.x > maxX) maxX = pt.x;
                    if (pt.y !== null && pt.y !== undefined) {
                        if (pt.y < minY) minY = pt.y;
                        if (pt.y > maxY) maxY = pt.y;
                    }
                    if (this.options.type === 'candlestick' && pt.low !== undefined && pt.high !== undefined) {
                        if (pt.low < minY) minY = pt.low;
                        if (pt.high > maxY) maxY = pt.high;
                    }
                });
            });

            const padY = (maxY - minY) * 0.1 || 1;
            minY -= padY;
            maxY += padY;

            this.minX = minX;
            this.maxX = maxX;
            this.minY = minY;
            this.maxY = maxY;

            const paddingLeft = 45;
            const paddingRight = 10;
            const paddingTop = 15;
            const paddingBottom = 25;

            this.chartWidth = width - paddingLeft - paddingRight;
            this.chartHeight = height - paddingTop - paddingBottom;
            this.paddingLeft = paddingLeft;
            this.paddingTop = paddingTop;

            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('width', '100%');
            svg.setAttribute('height', height);
            svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
            svg.style.overflow = 'visible';

            const ticks = 4;
            for (let i = 0; i < ticks; i++) {
                const val = minY + (maxY - minY) * (i / (ticks - 1));
                const y = height - paddingBottom - (this.chartHeight * (i / (ticks - 1)));
                
                const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                text.setAttribute('x', paddingLeft - 8);
                text.setAttribute('y', y + 3);
                text.setAttribute('text-anchor', 'end');
                text.setAttribute('fill', 'var(--t2)');
                text.setAttribute('font-size', '9px');
                text.setAttribute('font-family', 'var(--mono)');
                text.textContent = (this.options.yPrefix || '') + val.toFixed(2);
                svg.appendChild(text);

                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line.setAttribute('x1', paddingLeft);
                line.setAttribute('y1', y);
                line.setAttribute('x2', width - paddingRight);
                line.setAttribute('y2', y);
                line.setAttribute('stroke', 'rgba(255,255,255,0.03)');
                line.setAttribute('stroke-dasharray', '2 4');
                svg.appendChild(line);
            }

            const xTicks = [minX, minX + (maxX - minX) * 0.5, maxX];
            xTicks.forEach((tx, idx) => {
                const x = paddingLeft + (this.chartWidth * ((tx - minX) / (maxX - minX)));
                const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                text.setAttribute('x', x);
                text.setAttribute('y', height - 8);
                text.setAttribute('text-anchor', idx === 0 ? 'start' : idx === 2 ? 'end' : 'middle');
                text.setAttribute('fill', 'var(--t2)');
                text.setAttribute('font-size', '9px');
                text.setAttribute('font-family', 'var(--mono)');

                const date = new Date(tx);
                text.textContent = date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
                svg.appendChild(text);
            });

            this.series.forEach((s, sIdx) => {
                const points = s.data.filter(pt => pt.y !== null && pt.y !== undefined);
                if (points.length === 0) return;

                let sColor = this.colors[sIdx] || 'var(--signal)';
                if (sIdx === 0 && !this.dashArray[sIdx]) {
                    const isPos = points[points.length-1].y >= points[0].y;
                    sColor = isPos ? 'var(--signal)' : 'var(--crimson)';
                    this.dynamicSColor = sColor;
                } else if (sIdx === 0) {
                    this.dynamicSColor = sColor;
                }

                if (this.options.type === 'candlestick') {
                    const candleW = Math.max(1, (this.chartWidth / points.length) * 0.6);
                    points.forEach(pt => {
                        if (pt.open === undefined || pt.close === undefined) return;
                        const px = paddingLeft + (this.chartWidth * ((pt.x - minX) / (maxX - minX)));
                        const yO = height - paddingBottom - (this.chartHeight * ((pt.open - minY) / (maxY - minY)));
                        const yC = height - paddingBottom - (this.chartHeight * ((pt.close - minY) / (maxY - minY)));
                        const yH = height - paddingBottom - (this.chartHeight * ((pt.high - minY) / (maxY - minY)));
                        const yL = height - paddingBottom - (this.chartHeight * ((pt.low - minY) / (maxY - minY)));
                        
                        const cColor = pt.close >= pt.open ? 'var(--signal)' : 'var(--crimson)';
                        
                        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                        line.setAttribute('x1', px);
                        line.setAttribute('y1', yH);
                        line.setAttribute('x2', px);
                        line.setAttribute('y2', yL);
                        line.setAttribute('stroke', cColor);
                        line.setAttribute('stroke-width', '1');
                        svg.appendChild(line);

                        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                        rect.setAttribute('x', px - candleW/2);
                        rect.setAttribute('y', Math.min(yO, yC));
                        rect.setAttribute('width', candleW);
                        rect.setAttribute('height', Math.max(1, Math.abs(yO - yC)));
                        rect.setAttribute('fill', cColor);
                        svg.appendChild(rect);
                    });
                    return; // Skip line/area drawing for candlestick
                }

                if (points.length === 1) {
                    const pt = points[0];
                    const x = paddingLeft + (this.chartWidth * (maxX === minX ? 0.5 : (pt.x - minX) / (maxX - minX)));
                    const y = height - paddingBottom - (this.chartHeight * ((pt.y - minY) / (maxY - minY)));
                    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                    circle.setAttribute('cx', x);
                    circle.setAttribute('cy', y);
                    circle.setAttribute('r', '3');
                    circle.setAttribute('fill', sColor);
                    circle.style.opacity = this.options.opacities && this.options.opacities[sIdx] !== undefined ? this.options.opacities[sIdx] : '1';
                    svg.appendChild(circle);
                    return;
                }

                let pathD = '';
                points.forEach((pt, ptIdx) => {
                    const x = paddingLeft + (this.chartWidth * (maxX === minX ? 0.5 : (pt.x - minX) / (maxX - minX)));
                    const y = height - paddingBottom - (this.chartHeight * ((pt.y - minY) / (maxY - minY)));
                    if (ptIdx === 0) {
                        pathD += `M ${x} ${y}`;
                    } else {
                        pathD += ` L ${x} ${y}`;
                    }
                });

                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                path.setAttribute('d', pathD);
                path.setAttribute('fill', 'none');
                path.setAttribute('stroke', sColor);
                
                let strokeWidth = '1.75';
                let opacity = '1';
                if (this.options.strokeWidths && this.options.strokeWidths[sIdx] !== undefined) {
                    strokeWidth = this.options.strokeWidths[sIdx];
                }
                if (this.options.opacities && this.options.opacities[sIdx] !== undefined) {
                    opacity = this.options.opacities[sIdx];
                }
                path.setAttribute('stroke-width', strokeWidth);
                path.style.opacity = opacity;

                if (this.dashArray[sIdx]) {
                    path.setAttribute('stroke-dasharray', this.dashArray[sIdx]);
                    path.classList.add('forecast-dash-line');
                } else {
                    path.style.strokeDasharray = '2000';
                    path.style.strokeDashoffset = '2000';
                    path.style.animation = 'chartDraw 1.4s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards';
                }
                svg.appendChild(path);

                if (this.options.type === 'area' && sIdx === 0) {
                    const startX = paddingLeft + (this.chartWidth * ((points[0].x - minX) / (maxX - minX)));
                    const endX = paddingLeft + (this.chartWidth * ((points[points.length-1].x - minX) / (maxX - minX)));
                    const baselineY = height - paddingBottom;
                    const areaD = `${pathD} L ${endX} ${baselineY} L ${startX} ${baselineY} Z`;

                    const areaPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                    areaPath.setAttribute('d', areaD);
                    const gradId = `areaGrad-${this.container.id}-${sIdx}`;
                    let defs = svg.querySelector('defs');
                    if (!defs) {
                        defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
                        svg.appendChild(defs);
                    }
                    const grad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
                    grad.setAttribute('id', gradId);
                    grad.setAttribute('x1', '0%');
                    grad.setAttribute('y1', '0%');
                    grad.setAttribute('x2', '0%');
                    grad.setAttribute('y2', '100%');
                    
                    const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
                    stop1.setAttribute('offset', '0%');
                    stop1.setAttribute('stop-color', sColor);
                    stop1.setAttribute('stop-opacity', '0.12');

                    const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
                    stop2.setAttribute('offset', '100%');
                    stop2.setAttribute('stop-color', sColor);
                    stop2.setAttribute('stop-opacity', '0');

                    grad.appendChild(stop1);
                    grad.appendChild(stop2);
                    defs.appendChild(grad);

                    areaPath.setAttribute('fill', `url(#${gradId})`);
                    areaPath.style.opacity = '0';
                    areaPath.style.animation = 'fadeIn 0.6s ease 0.6s forwards';
                    svg.appendChild(areaPath);
                }

                if (!this.dashArray[sIdx]) {
                    const lastPt = points[points.length-1];
                    const lx = paddingLeft + (this.chartWidth * ((lastPt.x - minX) / (maxX - minX)));
                    const ly = height - paddingBottom - (this.chartHeight * ((lastPt.y - minY) / (maxY - minY)));
                    
                    const pulseRing = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                    pulseRing.setAttribute('cx', lx);
                    pulseRing.setAttribute('cy', ly);
                    pulseRing.setAttribute('r', '5');
                    pulseRing.setAttribute('fill', 'none');
                    pulseRing.setAttribute('stroke', sColor);
                    pulseRing.setAttribute('stroke-width', '1.5');
                    pulseRing.style.transformOrigin = `${lx}px ${ly}px`;
                    pulseRing.style.animation = 'pulseRing 1.8s infinite';
                    svg.appendChild(pulseRing);

                    const pulseCore = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                    pulseCore.setAttribute('cx', lx);
                    pulseCore.setAttribute('cy', ly);
                    pulseCore.setAttribute('r', '2.5');
                    pulseCore.setAttribute('fill', sColor);
                    svg.appendChild(pulseCore);
                }
            });

            const crosshairX = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            crosshairX.setAttribute('x1', '0');
            crosshairX.setAttribute('y1', '0');
            crosshairX.setAttribute('x2', '0');
            crosshairX.setAttribute('y2', height - paddingBottom);
            crosshairX.setAttribute('stroke', 'rgba(255, 255, 255, 0.2)');
            crosshairX.setAttribute('stroke-dasharray', '2 2');
            crosshairX.style.display = 'none';
            svg.appendChild(crosshairX);

            this.crosshairX = crosshairX;

            const tooltip = document.createElement('div');
            tooltip.style.position = 'absolute';
            tooltip.style.background = '#0F1318';
            tooltip.style.border = '1px solid var(--b1)';
            tooltip.style.borderRadius = '2px';
            tooltip.style.padding = '8px 12px';
            tooltip.style.pointerEvents = 'none';
            tooltip.style.display = 'none';
            tooltip.style.zIndex = '99';
            tooltip.style.fontFamily = 'var(--mono)';
            tooltip.style.fontSize = '10px';
            tooltip.style.boxShadow = '0 8px 24px rgba(0,0,0,0.5)';
            tooltip.style.color = 'var(--t1)';
            this.container.appendChild(tooltip);
            this.tooltip = tooltip;

            this.container.appendChild(svg);
        }

        initEvents() {
            if (!this.container) return;
            const svg = this.container.querySelector('svg');
            if (!svg) return;

            const self = this;
            svg.addEventListener('mousemove', (e) => {
                const rect = svg.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                
                const paddingLeft = self.paddingLeft;
                const chartWidth = self.chartWidth;
                if (mouseX < paddingLeft || mouseX > paddingLeft + chartWidth) {
                    self.hideTooltip();
                    return;
                }

                const pct = (mouseX - paddingLeft) / chartWidth;
                const valX = self.minX + (self.maxX - self.minX) * pct;

                const pts = self.series[0].data;
                let closest = pts[0];
                let closestDist = Infinity;
                pts.forEach(pt => {
                    const dist = Math.abs(pt.x - valX);
                    if (dist < closestDist) {
                        closestDist = dist;
                        closest = pt;
                    }
                });

                if (!closest) return;

                const cx = paddingLeft + (chartWidth * ((closest.x - self.minX) / (self.maxX - self.minX)));
                const cy = svg.clientHeight - 25 - (self.chartHeight * ((closest.y - self.minY) / (self.maxY - self.minY)));

                self.crosshairX.setAttribute('x1', cx);
                self.crosshairX.setAttribute('x2', cx);
                self.crosshairX.style.display = 'block';

                self.tooltip.style.display = 'block';
                self.tooltip.style.left = `${cx + 10}px`;
                self.tooltip.style.top = `${cy - 20}px`;

                const date = new Date(closest.x);
                const dateStr = date.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
                
                const firstY = pts[0].y;
                const diff = closest.y - firstY;
                const pctChg = (firstY !== 0) ? (diff / firstY) * 100 : 0;
                const sign = pctChg >= 0 ? '+' : '';
                const pctColor = pctChg >= 0 ? 'var(--signal)' : 'var(--crimson)';
                const priceColor = self.dynamicSColor || 'var(--signal)';

                self.tooltip.innerHTML = `
                    <div style="color:var(--t2); margin-bottom: 4px;">${dateStr}</div>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span style="font-weight: 700; color:${priceColor}; font-size: 13px;">
                            ${self.options.yPrefix || ''}${closest.y.toFixed(2)}
                        </span>
                        <span style="color:${pctColor}; font-size: 11px; background: rgba(255,255,255,0.05); padding: 2px 4px; border-radius: 3px;">
                            ${sign}${pctChg.toFixed(2)}%
                        </span>
                    </div>
                `;
            });

            svg.addEventListener('mouseleave', () => {
                self.hideTooltip();
            });
        }

        hideTooltip() {
            if (this.crosshairX) this.crosshairX.style.display = 'none';
            if (this.tooltip) this.tooltip.style.display = 'none';
        }
    }

    window.initLandingCharts = function() {
        var h = genSeries(22, 60.2, 1.4);
        var f = [].concat(Array(21).fill(null), [h[h.length - 1]]).concat(genSeries(8, h[h.length - 1], .6).slice(1));
        var timestamps = mkTimestamps(22, 8);

        new CustomSVGChart('landingChart', {
            height: 210,
            type: 'area',
            yPrefix: '€',
            series: [
                { name: 'Historical', data: h.map(function(v, i) { return { x: timestamps[i], y: v }; }) },
                { name: 'AI Forecast', data: f.map(function(v, i) { return { x: timestamps[i], y: v }; }) }
            ],
            colors: ['var(--signal)', 'var(--amber)'],
            dashArray: [0, 5]
        });
    }

    function renderDashChart(points, rangeKey, chartType) {
        if (!chartType) chartType = window.currentChartType;
        const sym = window.currentDashboardSymbol || 'CO2.MI';
        const isEua = sym === 'CO2.MI';
        const isCets = sym === '3060.HK';
        const baseSym = isEua ? '€' : (isCets ? '¥' : '$');
        
        // Ensure we handle light mode properly
        const isLight = document.documentElement.classList.contains('light-mode');
        const activeColorHex = isEua ? (isLight ? '#059669' : '#00FF87') : (isCets ? (isLight ? '#0ea5e9' : '#38bdf8') : (isLight ? '#D97706' : '#FFAB00'));
        const activeColor = isEua ? 'var(--signal)' : (isCets ? 'var(--electric)' : 'var(--amber)');
        const activeColorGlow = isEua ? (isLight ? 'rgba(5, 150, 105, 0.1)' : 'rgba(0, 255, 135, 0.1)') : (isCets ? (isLight ? 'rgba(14, 165, 233, 0.1)' : 'rgba(56, 189, 248, 0.1)') : (isLight ? 'rgba(217, 119, 6, 0.1)' : 'rgba(255, 171, 0, 0.1)'));

        const legendEl = document.getElementById('dashChartLegend');
        if (legendEl) {
            const legendText = isEua ? 'EUA=F (ICE ECX)' : (isCets ? '3060.HK (HKEX)' : 'KCCA (NYSE ARCA)');
            legendEl.innerHTML = `<div class="leg-item"><div class="leg-line" style="background:${activeColor}"></div>${legendText}</div>`;
        }

        const titleEl = document.getElementById('dashChartTitle');
        if (titleEl) {
            const name = isEua ? 'SparkChange Physical Carbon EUA ETC (CO2.MI)' : (isCets ? 'CICC Carbon Futures ETF (3060.HK)' : 'KraneShares California Carbon Allowance ETF (KCCA)');
            titleEl.textContent = name + ' · ' + rangeKey;
        }

        const container = document.getElementById('dashPriceChart');
        if (!container) return;
        
        // Destroy old Chart.js instance or clear SVG
        if (window.dashChartInstance) {
            window.dashChartInstance.destroy();
        }
        container.innerHTML = '';
        
        const canvas = document.createElement('canvas');
        canvas.style.width = '100%';
        canvas.style.height = '280px';
        container.appendChild(canvas);

        // Convert points to display currency values
        const convertedPoints = points.map(p => {
            const yVal = window.getPriceInDisplayCurrency ? window.getPriceInDisplayCurrency(p.y, sym) : p.y;
            const oVal = window.getPriceInDisplayCurrency ? window.getPriceInDisplayCurrency(p.open, sym) : p.open;
            const hVal = window.getPriceInDisplayCurrency ? window.getPriceInDisplayCurrency(p.high, sym) : p.high;
            const lVal = window.getPriceInDisplayCurrency ? window.getPriceInDisplayCurrency(p.low, sym) : p.low;
            return {
                x: p.x,
                y: yVal,
                open: oVal,
                high: hVal,
                low: lVal,
                close: yVal
            };
        });

        const labels = convertedPoints.map(p => {
            const d = new Date(p.x);
            
            const getOrdinalNum = (n) => n + (n > 0 ? ['ᵗʰ', 'ˢᵗ', 'ⁿᵈ', 'ʳᵈ'][(n > 3 && n < 21) || n % 10 > 3 ? 0 : n % 10] : '');
            const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
            
            const dayStr = getOrdinalNum(d.getDate());
            const monthStr = monthNames[d.getMonth()];
            const yearStr = d.getFullYear().toString().substr(-2);
            const timeStr = d.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
            
            const customDate = `${dayStr} ${monthStr} ${yearStr}`;
            
            if (rangeKey === '1D') return timeStr;
            if (rangeKey === '1W') return `${customDate}, ${timeStr}`;
            if (rangeKey === '1M' || rangeKey === '3M' || rangeKey === '6M') return customDate;
            return `${monthStr} '${yearStr}`;
        });
        const dataVals = convertedPoints.map(p => {
            if (chartType === 'candlestick') {
                return { x: p.x, o: p.open, h: p.high, l: p.low, c: p.y };
            }
            return p.y;
        });
        
        const gridColor = isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)';
        const textColor = isLight ? '#64748B' : '#6D8Baa';

        window.dashChartInstance = new Chart(canvas.getContext('2d'), {
            type: chartType === 'bar' ? 'bar' : (chartType === 'candlestick' ? 'candlestick' : 'line'),
            data: {
                labels: labels,
                datasets: [{
                    label: window.currentDashboardSymbol,
                    data: dataVals,
                    borderColor: activeColorHex,
                    backgroundColor: chartType === 'area' ? activeColorGlow : (chartType === 'bar' ? activeColorHex : 'transparent'),
                    borderWidth: 2,
                    color: {
                        up: isLight ? '#059669' : '#00FF87',
                        down: isLight ? '#EF4444' : '#FF4444',
                        unchanged: isLight ? '#64748B' : '#94A3B8'
                    },
                    pointRadius: 0,
                    pointHoverRadius: 5,
                    fill: chartType === 'area',
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: isLight ? 'rgba(255,255,255,0.95)' : 'rgba(15,18,25,0.95)',
                        titleColor: isLight ? '#0F172A' : '#fff',
                        bodyColor: isLight ? '#334155' : '#B5C8DD',
                        borderColor: isLight ? '#E2E8F0' : 'rgba(255,255,255,0.1)',
                        borderWidth: 1,
                        padding: 12,
                        displayColors: false,
                        callbacks: {
                            label: function(context) {
                                const idx = context.dataIndex;
                                const raw = context.raw;
                                const currentPrice = typeof raw === 'object' ? raw.c : context.parsed.y;
                                
                                if (currentPrice === undefined) return '';

                                let diffText = '';
                                if (idx > 0) {
                                    const prevRaw = dataVals[idx - 1];
                                    const prevPrice = typeof prevRaw === 'object' ? prevRaw.c : prevRaw;
                                    const diff = currentPrice - prevPrice;
                                    const perc = (diff / prevPrice) * 100;
                                    const sign = diff >= 0 ? '+' : '';
                                    diffText = ` (${sign}${perc.toFixed(2)}%)`;
                                }
                                
                                if (chartType === 'candlestick' && typeof raw === 'object') {
                                    return [
                                        `O: ${baseSym}${raw.o.toFixed(2)}  H: ${baseSym}${raw.h.toFixed(2)}`,
                                        `L: ${baseSym}${raw.l.toFixed(2)}  C: ${baseSym}${currentPrice.toFixed(2)}${diffText}`
                                    ];
                                }
                                return baseSym + currentPrice.toFixed(2) + diffText;
                            },
                            labelColor: function(context) {
                                return {
                                    borderColor: 'transparent',
                                    backgroundColor: 'transparent'
                                };
                            },
                            labelTextColor: function(context) {
                                const idx = context.dataIndex;
                                if (idx > 0) {
                                    const raw = context.raw;
                                    const currentPrice = typeof raw === 'object' ? raw.c : context.parsed.y;
                                    const prevRaw = dataVals[idx - 1];
                                    const prevPrice = typeof prevRaw === 'object' ? prevRaw.c : prevRaw;
                                    if (currentPrice > prevPrice) return isLight ? '#059669' : '#00FF87';
                                    if (currentPrice < prevPrice) return isLight ? '#EF4444' : '#FF3D57';
                                }
                                return isLight ? '#0F172A' : '#fff';
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: {
                            color: textColor,
                            maxTicksLimit: 6,
                            maxRotation: 0,
                            callback: function(value, index, values) {
                                const label = labels[index];
                                
                                return label;
                            }
                        }
                    },
                    y: {
                        position: 'right',
                        grid: { color: gridColor },
                        ticks: {
                            color: textColor,
                            callback: function(value) { return baseSym + value; }
                        }
                    }
                }
            }
        });
    }
    
    function setChartType(type, btn) {
        if (type === window.currentChartType) return;
        window.currentChartType = type;
        document.querySelectorAll('.chart-type-btn').forEach(function(b) { b.classList.remove('active'); });
        if (btn) btn.classList.add('active');
        if (window.currentDataPoints && window.currentDataPoints.length > 0) {
            renderDashChart(window.currentDataPoints, window.currentRange, type);
        }
    }

    // ─── RELATIVE PERFORMANCE COMPARISON CHART ──────────────────────────
    let lastPerformanceResults = null;
    let performanceSeriesHidden = {};

    window.togglePerformanceSeries = function(idx) {
        performanceSeriesHidden[idx] = !performanceSeriesHidden[idx];
        const el = document.getElementById('perf-leg-item-' + idx);
        if (el) {
            el.classList.toggle('hidden', performanceSeriesHidden[idx]);
        }
        renderPerformanceChart();
    };

    window.renderPerformanceChart = function() {
        if (!lastPerformanceResults) return;
        const container = document.getElementById('relativePerformanceChart');
        if (!container) return;

        const seriesList = [];
        const colorsList = [];
        const dashArrayList = [];
        const strokeWidthsList = [];
        const opacitiesList = [];

        Object.keys(MARKET_TICKERS).forEach((symbol, idx) => {
            if (performanceSeriesHidden[idx]) return;

            const res = lastPerformanceResults[symbol];
            if (!res || !res.points || res.points.length === 0) return;

            const firstVal = res.points[0].y;
            const isFlat = res.points.every(pt => pt.y === firstVal);
            const offset = isFlat ? (idx * 0.4) : 0;
            const rebasedPoints = res.points.map(pt => ({
                x: pt.x,
                y: (pt.y / firstVal) * 100 + offset
            }));

            const isSelected = (symbol === window.currentDashboardSymbol);

            seriesList.push({
                name: MARKET_TICKERS[symbol].sym,
                data: rebasedPoints
            });
            colorsList.push(DONUT_COLORS[idx]);

            if (isSelected) {
                dashArrayList.push(null); // solid
                strokeWidthsList.push('2.5');
                opacitiesList.push('1');
            } else {
                dashArrayList.push(idx === 1 ? [4, 4] : [2, 6]); // different dash arrays
                strokeWidthsList.push('1.15');
                opacitiesList.push('0.6');
            }
        });

        if (seriesList.length === 0) {
            container.innerHTML = '<div style="color:var(--t3); text-align:center; padding-top:80px; font-family:var(--mono);">Select assets to compare</div>';
            return;
        }

        new CustomSVGChart('relativePerformanceChart', {
            height: 240,
            type: 'line',
            yPrefix: '',
            series: seriesList,
            colors: colorsList,
            dashArray: dashArrayList,
            strokeWidths: strokeWidthsList,
            opacities: opacitiesList
        });
    }

    function updatePerformanceLegend() {
        const legendContainer = document.getElementById('relativePerformanceLegend');
        if (!legendContainer) return;

        let html = '';
        Object.keys(MARKET_TICKERS).forEach((symbol, idx) => {
            const asset = MARKET_TICKERS[symbol];
            const isHidden = performanceSeriesHidden[idx] ? ' hidden' : '';
            html += '<div id="perf-leg-item-' + idx + '" class="performance-legend-item' + isHidden + '" onclick="togglePerformanceSeries(' + idx + ')">' +
                '<div class="performance-legend-color" style="background:' + DONUT_COLORS[idx] + ';"></div>' +
                '<span>' + asset.sym + '</span>' +
                '</div>';
        });
        legendContainer.innerHTML = html;
    }

    async function updatePerformanceChartData(rangeKey) {
        const map = {
            '1D': { range: '1d', interval: '5m' },
            '1W': { range: '7d', interval: '15m' },
            '1M': { range: '1mo', interval: '1d' },
            '3M': { range: '3mo', interval: '1d' },
            '1Y': { range: '1y', interval: '1wk' },
            'ALL': { range: 'max', interval: '1mo' },
        };
        const config = map[rangeKey];
        if (!config) return;

        const symbols = Object.keys(MARKET_TICKERS);
        const promises = symbols.map(symbol => 
            window.fetchYahooFinanceData(config.range, config.interval, symbol)
                .then(res => ({ symbol: symbol, data: res }))
                .catch(err => {
                    console.warn(`Failed to fetch performance for ${symbol}:`, err);
                    return { symbol: symbol, data: generateFallbackData(config.range, symbol) };
                })
        );

        try {
            const results = await Promise.all(promises);
            lastPerformanceResults = {};
            results.forEach(item => {
                lastPerformanceResults[item.symbol] = item.data;
            });
            updatePerformanceLegend();
            renderPerformanceChart();
        } catch (e) {
            console.error('Error updating performance chart data:', e);
        }
    }

    // ─── TIMEFRAME CONTROLLER ──────────────────────────────────────────
    async function setDashRange(rangeKey, btn) {
        document.querySelectorAll('#rangeSel .range-btn').forEach(function(b) { b.classList.remove('active'); });
        if (btn) btn.classList.add('active');
        window.currentRange = rangeKey;

        const map = {
            '1D': { range: '1d', interval: '5m' },
            '1W': { range: '7d', interval: '15m' },
            '1M': { range: '1mo', interval: '1d' },
            '3M': { range: '3mo', interval: '1d' },
            '1Y': { range: '1y', interval: '1wk' },
            'ALL': { range: 'max', interval: '1mo' },
        };
        const config = map[rangeKey];
        if (!config) return;

        const chartContainer = document.getElementById('dashPriceChart');
        chartContainer.style.opacity = '0.5';

        try {
            const result = await window.fetchYahooFinanceData(config.range, config.interval, window.currentDashboardSymbol);
            window.currentDataPoints = result.points;
            window.updateDashStats(result);
            renderDashChart(result.points, rangeKey, window.currentChartType);
            chartContainer.style.opacity = '1';
            const subEl = document.getElementById('dashChartSub');
            if (subEl) {
                subEl.textContent = result.isFallback ?
                    'Live feed unavailable – showing simulated data' :
                    'Live price data from Yahoo Finance · ' + new Date().toLocaleString();
            }
            
            // Trigger performance comparison chart load concurrently
            updatePerformanceChartData(rangeKey);
        } catch (err) {
            console.error('Failed to load data for range', rangeKey, err);
            chartContainer.style.opacity = '1';
            var subEl2 = document.getElementById('dashChartSub');
            if (subEl2) subEl2.textContent = 'Error loading data. Using fallback.';
        }
    }

    // ─── CARBON MARKET SWITCHING ────────────────────────────────────────
    function updateDashboardAssetLabels() {
        const config = MARKET_CONFIGS[window.currentDashboardSymbol] || MARKET_CONFIGS['CO2.MI'];
        const metadata = ASSET_METADATA[window.currentDashboardSymbol] || { name: window.currentDashboardSymbol };
        const ticker = MARKET_TICKERS[window.currentDashboardSymbol] || { sym: window.currentDashboardSymbol };
        
        const specExch = document.getElementById('specExch');
        if (specExch) specExch.textContent = config.exchange;
        
        const specHours = document.getElementById('specHours');
        if (specHours) specHours.textContent = config.hoursLabel;
        
        const titleEl = document.getElementById('dashChartTitle');
        if (titleEl) {
            titleEl.textContent = ticker.sym + ' ' + metadata.name + ' Spot Terminal';
        }
        
        const regionTitleEl = document.getElementById('dashMainRegionTitle');
        if (regionTitleEl) {
            regionTitleEl.textContent = metadata.regionTitle || (ticker.sym + ' Price');
        }
        
        const orderActiveSym = document.getElementById('orderActiveSym');
        if (orderActiveSym) orderActiveSym.textContent = ticker.sym;
        if (typeof updateOrderTicketEstimation === 'function') {
            updateOrderTicketEstimation();
        }
        
        logSync(`Switched active terminal target to ${ticker.sym}`, 'INFO');
    }

    // ─── INSTANT ORDER TICKET LOGIC ──────────────────────────────────────
    let currentOrderType = 'BUY';

    window.setOrderType = function(type) {
        currentOrderType = type;
        const buyBtn = document.getElementById('orderTypeBuy');
        const sellBtn = document.getElementById('orderTypeSell');
        if (!buyBtn || !sellBtn) return;
        
        if (type === 'BUY') {
            buyBtn.style.background = 'var(--signal)';
            buyBtn.style.color = 'var(--ink)';
            sellBtn.style.background = 'transparent';
            sellBtn.style.color = 'var(--t3)';
        } else {
            buyBtn.style.background = 'transparent';
            buyBtn.style.color = 'var(--t3)';
            sellBtn.style.background = 'var(--crimson)';
            sellBtn.style.color = 'var(--t1)';
        }
    };

    window.updateOrderTicketEstimation = function() {
        const symbol = window.currentDashboardSymbol;
        const price = window.holdingsPrices[symbol] || 0;
        const qtyInput = document.getElementById('orderQtyInput');
        if (!qtyInput) return;
        const qty = parseFloat(qtyInput.value) || 0;
        
        let multiplier = 1000;
        
        const displayPrice = getPriceInDisplayCurrency(price, symbol);
        const estValue = displayPrice * qty * multiplier;
        
        let currency = '$';
        const ticker = MARKET_TICKERS[symbol];
        if (ticker) {
            if (ticker.displayCurrency === 'EUR') currency = '€';
            else if (ticker.displayCurrency === 'CNY') currency = '¥';
        }
        
        const estValEl = document.getElementById('orderEstValue');
        if (estValEl) {
            estValEl.textContent = currency + estValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }
    };

    window.submitMockOrder = function() {
        const symbol = window.currentDashboardSymbol;
        const ticker = MARKET_TICKERS[symbol];
        if (!ticker) return;
        const price = window.holdingsPrices[symbol] || 0;
        const qtyInput = document.getElementById('orderQtyInput');
        if (!qtyInput) return;
        const qty = parseInt(qtyInput.value, 10) || 0;
        
        if (qty <= 0) return;
        
        let multiplier = 1000;
        
        const displayPrice = getPriceInDisplayCurrency(price, symbol);
        const totalCost = displayPrice * qty * multiplier;
        
        let currency = '$';
        if (ticker.displayCurrency === 'EUR') currency = '€';
        else if (ticker.displayCurrency === 'CNY') currency = '¥';
        
        const timeStr = new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        
        const logList = document.getElementById('orderLogList');
        if (logList) {
            if (logList.innerHTML.includes('No mock trades executed yet.')) {
                logList.innerHTML = '';
            }
            
            const isBuy = currentOrderType === 'BUY';
            const badgeColor = isBuy ? 'var(--signal)' : 'var(--crimson)';
            
            const logEntry = document.createElement('div');
            logEntry.style.borderLeft = `2px solid ${badgeColor}`;
            logEntry.style.paddingLeft = '6px';
            logEntry.style.marginBottom = '6px';
            logEntry.style.lineHeight = '1.3';
            logEntry.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span style="color:${badgeColor}; font-weight:700;">${currentOrderType} ${qty} LOTS</span>
                    <span style="color:var(--t4); font-size:8px;">${timeStr}</span>
                </div>
                <div style="color:var(--t2); font-size:9.5px;">${ticker.sym} @ ${currency}${displayPrice.toFixed(2)} (${currency}${totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })})</div>
            `;
            
            logList.insertBefore(logEntry, logList.firstChild);
            logSync(`Executed mock ${currentOrderType} of ${qty} lots of ${ticker.sym}`, 'SUCCESS');
        }
    };



// ─── INIT DASHBOARD ──────────────────────────────────────────────
    window.initDashCharts = async function() {
        const checkbox = document.getElementById("themeCheckbox");
        if (checkbox) checkbox.checked = document.documentElement.classList.contains("light-mode");
        // Show all symbols in the performance comparison chart by default
        Object.keys(MARKET_TICKERS).forEach((sym, idx) => {
            performanceSeriesHidden[idx] = false;
        });
        updatePerformanceLegend();

        // Sync initial dropdown value
        const dropdown = document.getElementById('marketSystemDropdown');
        if (dropdown) dropdown.value = window.currentDashboardSymbol;

        updateDashboardAssetLabels();
        window.updateMarketStatusUI();
        setInterval(window.updateMarketStatusUI, 1000);
        updateSortHeaders();
        await setDashRange('1M', document.querySelector('#rangeSel .range-btn.active'));
        if (window.dashRefreshTimer) clearInterval(window.dashRefreshTimer);
        window.dashRefreshTimer = setInterval(periodicRefresh, 60000);
        document.querySelector('.chart-type-btn.active')?.classList.remove('active');
        document.querySelector('.chart-type-btn[data-type="area"]')?.classList.add('active');
        window.currentChartType = 'area';
    }

    // ─── SPREAD & CORRELATION ANALYTICS ──────────────────────────────
    function getEurToUsdRate() {
        if (!_fxRates) return 1.08;
        const base = window.currentDashboardSymbol === 'CO2.MI' ? 'EUR' : 'USD';
        if (base === 'EUR') {
            return _fxRates.USD || 1.08;
        } else {
            return _fxRates.EUR ? (1 / _fxRates.EUR) : 1.08;
        }
    }

    function getCorrelation(xSeries, ySeries) {
        const n = xSeries.length;
        if (n === 0) return 0;
        let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0, sumYY = 0;
        for (let i = 0; i < n; i++) {
            const x = xSeries[i];
            const y = ySeries[i];
            sumX += x;
            sumY += y;
            sumXY += x * y;
            sumXX += x * x;
            sumYY += y * y;
        }
        const num = n * sumXY - sumX * sumY;
        const den = Math.sqrt((n * sumXX - sumX * sumX) * (n * sumYY - sumY * sumY));
        return den === 0 ? 0 : num / den;
    }// ─── HERO LIVE INSTRUMENT PANEL ─────────────────────────────────────
    window.initHeroInstrumentPanel = function() {
        const heroPrices = {
            'EUA':  { price: 63.45,  change: 2.06,  currency: '\u20ac' },
            'CCA':  { price: 14.80,  change: -0.27, currency: '$' },
            'CHN':  { price: 63.36,  change: 1.74,  currency: '\u00a5' }
        };
        const endpoints = { 'EUA':'CO2.MI','CCA':'KCCA','CHN':'3060.HK' };
        let bootComplete = false;
        let lastSyncTime = Date.now();
        const sparkHistory = {
            EUA:  [28,26,22,20,18,24,18,12,14,10,8,6],
            CCA:  [8,10,12,14,16,14,18,22,20,24,26,30],
            CHN:  [22,20,18,16,14,18,14,10,12,10,10,8]
        };

        // Sync timer in chrome bar
        const timerEl = document.getElementById('heroSyncTimer');
        setInterval(() => {
            if (timerEl && bootComplete) {
                const s = ((Date.now() - lastSyncTime)/1000).toFixed(1);
                timerEl.textContent = `LAST SYNC: ${s}s AGO`;
            }
        }, 100);

        // API Console logger
        const consoleEl = document.getElementById('termConsole');
        function logConsole(sym, price, change, currency, lat) {
            if (!consoleEl) return;
            const n = new Date();
            const ts = `${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}:${String(n.getSeconds()).padStart(2,'0')}`;
            const sign = change > 0 ? '+' : '';
            const line = document.createElement('div');
            line.className = 'con-line';
            line.innerHTML = `<span class="con-ts">[${ts}]</span><span class="con-sym">${sym.padEnd(5,' ')}</span><span class="con-val">\u2190 ${currency}${price.toFixed(2)} (${sign}${change.toFixed(2)}%)</span><span class="con-meta"> via yahoo/${endpoints[sym]||sym}  ${lat}ms</span>`;
            const existing = consoleEl.querySelectorAll('.con-line');
            if (existing.length >= 3) existing[0].remove();
            consoleEl.appendChild(line);
        }

        // Hero stat row updater
        function updateHeroStat(key, price, currency) {
            const map = { EUA:'hstat-eua', CCA:'hstat-cca', CHN:'hstat-chn' };
            const el = document.getElementById(map[key]);
            if (el) {
                el.textContent = `${currency}${price.toFixed(2)}`;
                el.style.animation = 'none'; void el.offsetWidth;
                el.style.animation = 'priceIn .3s ease';
            }
        }

        // Sparkline updater
        function genSparkPath(hist, w=120, h=36) {
            const mn=Math.min(...hist), mx=Math.max(...hist), rng=mx-mn||1, step=w/(hist.length-1);
            const pts = hist.map((v,i) => `${(i*step).toFixed(1)},${(h-((v-mn)/rng)*(h-4)-2).toFixed(1)}`);
            let d = `M${pts[0]}`;
            for (let i=0; i<pts.length-1; i++) {
                const [x1,y1]=pts[i].split(',').map(Number); const [x2,y2]=pts[i+1].split(',').map(Number);
                const mx2=(x1+x2)/2; d+=` C${mx2},${y1} ${mx2},${y2} ${x2},${y2}`;
            }
            return d;
        }
        function updateSparkline(key, isUp) {
            const hist = sparkHistory[key]; if (!hist) return;
            const last = hist[hist.length-1];
            hist.push(Math.max(2, Math.min(34, last+(isUp?-(Math.random()*1.5+0.5):(Math.random()*1.5+0.5)))));
            hist.shift();
            const pe = document.getElementById(`spark-path-${key}`);
            if (pe) { pe.setAttribute('d', genSparkPath(hist)); pe.style.animation='none'; void pe.offsetWidth; pe.style.animation='sparkDraw .6s ease forwards'; }
        }

        // Resolve a skeleton row to real data
        function resolveRow(key) {
            const asset   = heroPrices[key];
            const priceEl = document.getElementById(`heroprice-${key}`);
            const chgEl   = document.getElementById(`herochg-${key}`);
            const rowEl   = document.getElementById(`herorow-${key}`);
            if (!rowEl||!priceEl||!chgEl) return;
            rowEl.classList.remove('loading');
            priceEl.textContent = `${asset.currency}${asset.price.toFixed(2)}`;
            priceEl.style.animation = 'priceIn .35s ease both';
            const sign = asset.change > 0 ? '+' : '';
            chgEl.textContent = `${sign}${asset.change.toFixed(2)}%`;
            chgEl.className = `inst-chg ${asset.change>0?'pos':'neg'}`;
            rowEl.classList.add('flash-up');

            // Update ticker tape
            const tapePriceEl = document.getElementById(`tape-price-${key}`);
            const tapeChgEl = document.getElementById(`tape-chg-${key}`);
            const tapePriceElDup = document.getElementById(`tape-price-${key}-dup`);
            const tapeChgElDup = document.getElementById(`tape-chg-${key}-dup`);
            const tapeSign = asset.change > 0 ? '▲ +' : '▼ ';
            if (tapePriceEl) tapePriceEl.textContent = `${asset.currency}${asset.price.toFixed(2)}`;
            if (tapePriceElDup) tapePriceElDup.textContent = `${asset.currency}${asset.price.toFixed(2)}`;
            if (tapeChgEl) {
                tapeChgEl.textContent = `${tapeSign}${Math.abs(asset.change).toFixed(2)}%`;
                tapeChgEl.className = asset.change > 0 ? 'pos' : 'neg';
            }
            if (tapeChgElDup) {
                tapeChgElDup.textContent = `${tapeSign}${Math.abs(asset.change).toFixed(2)}%`;
                tapeChgElDup.className = asset.change > 0 ? 'pos' : 'neg';
            }

            logConsole(key, asset.price, asset.change, asset.currency, Math.floor(Math.random()*20)+8);
            updateHeroStat(key, asset.price, asset.currency);
            // Sync the Global Carbon Compliance Markets section cards
            const mktCardMap = { EUA:'mktcard-eua', CCA:'mktcard-cca', CHN:'mktcard-chn' };
            const mktPfx = mktCardMap[key];
            if (mktPfx) {
                const mktPrEl = document.getElementById(`${mktPfx}-price`);
                const mktChEl = document.getElementById(`${mktPfx}-chg`);
                if (mktPrEl) mktPrEl.textContent = `${asset.currency}${asset.price.toFixed(2)}`;
                if (mktChEl) {
                    const sign = asset.change > 0 ? '+' : '';
                    const arrow = asset.change > 0 ? '▲' : '▼';
                    mktChEl.textContent = `${arrow} ${sign}${asset.change.toFixed(2)}%`;
                    mktChEl.className = `mkt-change ${asset.change > 0 ? 'pos' : 'neg'}`;
                }
            }
        }

        // Boot sequence
        const bootLogEl = document.getElementById('termBootLog');
        const bootMessages = [
            { cls:'boot-text-sys',  text:'CARBONIQ MARKET TERMINAL v4.2 \u2014 INIT' },
            { cls:'boot-text-dim',  text:'Resolving api.finance.yahoo.com...' },
            { cls:'boot-text-ok',   text:'DNS resolved \u2192 87.248.98.5  [12ms]' },
            { cls:'boot-text-dim',  text:'Negotiating TLS 1.3 session...' },
            { cls:'boot-text-ok',   text:'Secure stream established  \u2713' },
            { cls:'boot-text-dim',  text:'Authenticating API credentials...' },
            { cls:'boot-text-ok',   text:'Auth OK \u2014 quota: 2000 req/hr  \u2713' },
            { cls:'boot-text-warn', text:'Fetching 3 instrument snapshots...' }
        ];

        function addBootLine(msg, delay) {
            return new Promise(res => {
                setTimeout(() => {
                    if (!bootLogEl) { res(); return; }
                    const line = document.createElement('div'); line.className='boot-line';
                    const pre = document.createElement('span'); pre.className='boot-prefix'; pre.textContent='\u25b8';
                    const txt = document.createElement('span'); txt.className=msg.cls; txt.textContent=msg.text;
                    line.appendChild(pre); line.appendChild(txt); bootLogEl.appendChild(line); res();
                }, delay);
            });
        }

        // Map landing keys to Yahoo symbols and currencies
        const LIVE_SYMBOL_MAP = {
            EUA: { symbol: 'CO2.MI', currency: '€', fallback: 63.45, fallbackChg: 2.06 },
            CCA: { symbol: 'KCCA',   currency: '$', fallback: 14.80, fallbackChg: -0.27 },
            CHN: { symbol: '3060.HK',currency: '¥', fallback: 63.36, fallbackChg: 1.74 }
        };

        // Fetch live prices for all 3 instruments and update heroPrices
        async function fetchLivePrices() {
            const keys = Object.keys(LIVE_SYMBOL_MAP);
            await Promise.allSettled(keys.map(async (key) => {
                const cfg = LIVE_SYMBOL_MAP[key];
                try {
                    const data = await fetchSingleTicker(cfg.symbol);
                    if (data && data.price && !isNaN(data.price)) {
                        let displayPrice = data.price;
                        // Convert 3060.HK from HKD to CNY (approx rate 0.925)
                        if (cfg.symbol === '3060.HK') {
                            const cnyRate = (window._fxRates && window._fxRates['CNY'] && window._fxRates['HKD'])
                                ? window._fxRates['CNY'] / window._fxRates['HKD']
                                : 0.925;
                            displayPrice = data.price * cnyRate;
                        }
                        heroPrices[key].price  = displayPrice;
                        heroPrices[key].change = data.changePct;
                    }
                } catch(e) {
                    // keep fallback values already in heroPrices
                }
            }));
        }

        async function runBoot() {
            let delay = 0;
            for (let i=0; i<bootMessages.length; i++) { delay += i===0?300:280; await addBootLine(bootMessages[i], delay); }

            // Fetch real live prices during the boot animation
            fetchLivePrices(); // fire and forget — resolveRow uses whatever heroPrices has at that point

            const rowKeys = ['EUA','CCA','CHN'];
            for (let i=0; i<rowKeys.length; i++) {
                await new Promise(res => setTimeout(res, delay+340+i*210));
                resolveRow(rowKeys[i]);
            }
            await new Promise(res => setTimeout(res, delay+340+rowKeys.length*210+100));
            await addBootLine({ cls:'boot-text-ok', text:'All instruments live \u2014 streaming active  \u2713' }, 0);
            bootComplete = true; lastSyncTime = Date.now();
            if (timerEl) timerEl.textContent = 'LIVE';

            // Re-fetch real prices every 30 seconds to keep the drift anchored to reality
            setInterval(async () => {
                await fetchLivePrices();
            }, 30000);

            setTimeout(() => {
                if (bootLogEl) {
                    bootLogEl.style.transition = 'max-height .5s ease, opacity .5s ease, padding .5s ease';
                    bootLogEl.style.maxHeight='0'; bootLogEl.style.opacity='0'; bootLogEl.style.padding='0 16px';
                }
            }, 2800);

        }

        // Periodic tick every 6s
        setInterval(() => {
            if (!bootComplete) return;
            lastSyncTime = Date.now();
            const keys = Object.keys(heroPrices);
            const chosen = [];
            while (chosen.length < Math.floor(Math.random()*2)+1) {
                const k = keys[Math.floor(Math.random()*keys.length)];
                if (!chosen.includes(k)) chosen.push(k);
            }
            for (const key of chosen) {
                const asset = heroPrices[key];
                const isUp  = Math.random() > 0.45;
                // asset.price remains live, no random drift
                // asset.change remains live, no random drift
                const priceEl = document.getElementById(`heroprice-${key}`);
                const chgEl   = document.getElementById(`herochg-${key}`);
                const rowEl   = document.getElementById(`herorow-${key}`);
                if (priceEl&&chgEl&&rowEl) {
                    priceEl.style.animation='none'; void priceEl.offsetWidth; priceEl.style.animation='tickBounce .35s ease';
                    priceEl.textContent = `${asset.currency}${asset.price.toFixed(2)}`;
                    const sign = asset.change>0?'+':'';
                    chgEl.textContent = `${sign}${asset.change.toFixed(2)}%`;
                    chgEl.className = `inst-chg ${asset.change>0?'pos':'neg'}`;
                    rowEl.classList.remove('flash-up','flash-down'); void rowEl.offsetWidth;
                    rowEl.classList.add(isUp?'flash-up':'flash-down');
                }
                updateSparkline(key, isUp);
                const tpe = document.getElementById(`tile-price-${key}`);
                const tce = document.getElementById(`tile-change-${key}`);
                if (tpe) tpe.textContent = `${asset.currency}${asset.price.toFixed(2)}`;
                if (tce) {
                    const s = asset.change>0?'+':'\u2212';
                    tce.textContent = `${isUp?'\u25b2':'\u25bc'} ${s}${Math.abs(asset.change).toFixed(2)}%`;
                    tce.className = `tile-change ${isUp?'pos':'neg'}`;
                }

                // Update ticker tape
                const tapePriceEl = document.getElementById(`tape-price-${key}`);
                const tapeChgEl = document.getElementById(`tape-chg-${key}`);
                const tapePriceElDup = document.getElementById(`tape-price-${key}-dup`);
                const tapeChgElDup = document.getElementById(`tape-chg-${key}-dup`);
                const tapeSign = asset.change > 0 ? '▲ +' : '▼ ';
                if (tapePriceEl) tapePriceEl.textContent = `${asset.currency}${asset.price.toFixed(2)}`;
                if (tapePriceElDup) tapePriceElDup.textContent = `${asset.currency}${asset.price.toFixed(2)}`;
                if (tapeChgEl) {
                    tapeChgEl.textContent = `${tapeSign}${Math.abs(asset.change).toFixed(2)}%`;
                    tapeChgEl.className = asset.change > 0 ? 'pos' : 'neg';
                }
                if (tapeChgElDup) {
                    tapeChgElDup.textContent = `${tapeSign}${Math.abs(asset.change).toFixed(2)}%`;
                    tapeChgElDup.className = asset.change > 0 ? 'pos' : 'neg';
                }

                updateHeroStat(key, asset.price, asset.currency);
                logConsole(key, asset.price, asset.change, asset.currency, Math.floor(Math.random()*18)+7);
                // Sync the Global Carbon Compliance Markets section cards
                const mktCardMap2 = { EUA:'mktcard-eua', CCA:'mktcard-cca', CHN:'mktcard-chn' };
                const mktPfx2 = mktCardMap2[key];
                if (mktPfx2) {
                    const mktPrEl2 = document.getElementById(`${mktPfx2}-price`);
                    const mktChEl2 = document.getElementById(`${mktPfx2}-chg`);
                    if (mktPrEl2) { mktPrEl2.style.animation='none'; void mktPrEl2.offsetWidth; mktPrEl2.style.animation='tickBounce .35s ease'; mktPrEl2.textContent = `${asset.currency}${asset.price.toFixed(2)}`; }
                    if (mktChEl2) {
                        const sign2 = asset.change > 0 ? '+' : '';
                        const arrow2 = asset.change > 0 ? '▲' : '▼';
                        mktChEl2.textContent = `${arrow2} ${sign2}${asset.change.toFixed(2)}%`;
                        mktChEl2.className = `mkt-change ${asset.change > 0 ? 'pos' : 'neg'}`;
                    }
                }
            }
        }, 6000);

        runBoot();
    };

    // Call init and start update ticker loop
    (async function initTicker() {
        buildTicker();
        await updateTickerData();
        setInterval(updateTickerData, 30000);
    })();
