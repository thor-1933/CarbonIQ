// ─── MAIN APPLICATION SHELL & INITIALIZERS ───

// ─── STATE ─────────────────────────────────────────────
    window.currentUser = null;
    window.chartsInit = false;
    window.dashChartsInit = false;
    window.pendingPanel = null;
    window.dashChart = null;
    window.currentChartType = 'area';
    window.currentRange = '1M';
    window.currentDataPoints = [];
    window.currentPrevClose = null;
    window.dashRefreshTimer = null;
    window.currentDashboardSymbol = 'CO2.MI';

    window.holdingsPrices = {
        'CO2.MI': 63.45,
        'KCCA': 14.80,
        '3060.HK': 68.50
    };

    window.holdingsChanges = {
        'CO2.MI': 2.06,
        'KCCA': -0.27,
        '3060.HK': 1.74
    };

    // Rolling history cache for live sparklines
    window.holdingsHistory = {
        'CO2.MI': [62.80, 62.95, 63.10, 62.90, 63.20, 63.05, 63.15, 63.30, 63.25, 63.45],
        'KCCA': [15.10, 15.00, 14.95, 14.90, 14.85, 14.78, 14.82, 14.75, 14.85, 14.80],
        '3060.HK': [67.20, 67.50, 67.80, 67.60, 68.10, 68.30, 68.20, 68.50, 68.40, 68.50]
    };

    const lastHoldingsPrices = Object.assign({}, window.holdingsPrices);
    let currentTableSortKey = 'symbol';
    let currentSortOrder = 'asc';
    let secondsSinceLastSync = 0;

    // Timer loop for Synced Xs Ago indicator
    setInterval(function() {
        secondsSinceLastSync++;
        var syncTimerEl = document.getElementById('syncTimer');
        if (syncTimerEl) syncTimerEl.textContent = secondsSinceLastSync;
    }, 1000);

    function resetSyncTimer() {
        secondsSinceLastSync = 0;
        var syncTimerEl = document.getElementById('syncTimer');
        if (syncTimerEl) syncTimerEl.textContent = '0';
        
        // Brief pulse effect on the sync dot
        var dot = document.getElementById('liveSyncDot');
        if (dot) {
            dot.style.transform = 'scale(1.8)';
            setTimeout(function() { dot.style.transform = 'scale(1)'; }, 400);
        }
    }

    function updateSortHeaders() {
        const keys = ['symbol', 'price', 'absChange', 'change', 'volume'];
        keys.forEach(key => {
            const el = document.getElementById('sort-arr-' + key);
            if (el) {
                if (currentTableSortKey === key) {
                    el.textContent = currentSortOrder === 'asc' ? ' ▲' : ' ▼';
                    el.style.color = 'var(--signal)';
                } else {
                    el.textContent = '';
                }
            }
        });
    }

    window.sortInstrumentTable = function(sortBy) {
        if (currentTableSortKey === sortBy) {
            currentSortOrder = currentSortOrder === 'asc' ? 'desc' : 'asc';
        } else {
            currentTableSortKey = sortBy;
            currentSortOrder = (sortBy === 'symbol') ? 'asc' : 'desc';
        }
        updateSortHeaders();
        updateHoldingsTable();
        resetSyncTimer();
    };

    function generateSparklineSVG(history, isPositive) {
    if (!history || history.length < 2) return '';
    var min = Math.min.apply(null, history);
    var max = Math.max.apply(null, history);   // ✅ add this
    var range = max - min || 1;
        var width = 60;
        var height = 18;
        var points = history.map(function(val, idx) {
            var x = (idx / (history.length - 1)) * width;
            var y = height - 1.5 - ((val - min) / range) * (height - 3);
            return x.toFixed(1) + ',' + y.toFixed(1);
        });
        var color = isPositive ? 'var(--signal)' : 'var(--crimson)';
        return '<svg width="' + width + '" height="' + height + '" style="overflow:visible;display:block;margin:0 auto;"><polyline fill="none" stroke="' + color + '" stroke-width="1.8" points="' + points.join(' ') + '"/></svg>';
    }

    function triggerPriceFlash(symbol, isUp) {
        var row = document.getElementById('term-row-' + symbol);
        if (row) {
            row.classList.remove('flash-up-cell', 'flash-down-cell');
            void row.offsetWidth; // trigger reflow
            row.classList.add(isUp ? 'flash-up-cell' : 'flash-down-cell');
        }
        
        // Also flash specific table cells
        var priceCell = document.getElementById('cell-price-' + symbol);
        var chgCell = document.getElementById('cell-chg-' + symbol);
        if (priceCell) {
            priceCell.classList.remove('flash-up-cell', 'flash-down-cell');
            void priceCell.offsetWidth;
            priceCell.classList.add(isUp ? 'flash-up-cell' : 'flash-down-cell');
        }
        if (chgCell) {
            chgCell.classList.remove('flash-up-cell', 'flash-down-cell');
            void chgCell.offsetWidth;
            chgCell.classList.add(isUp ? 'flash-up-cell' : 'flash-down-cell');
        }
    }

    // Full name and custom exchange listing for each ticker
    const ASSET_METADATA = {
        'CO2.MI': { name: 'EUA Futures (EU ETS)', volume: '2.41M lots', regionTitle: 'Europe Carbon Permit Price (EUA)' },
        'KCCA': { name: 'California CCA ETF', volume: '0.45M lots', regionTitle: 'California Carbon Allowance Price (CCA)' },
        '3060.HK': { name: 'CICC Carbon Futures (China)', volume: '1.18M lots', regionTitle: 'China Carbon Emissions Price (CETS)' }
    };

    const ASSET_NUMERIC_VOLUMES = {
        'CO2.MI': 2410000,
        'KCCA': 450000,
        '3060.HK': 1180000
    };

    function getPriceInDisplayCurrency(price, symbol) {
        const ticker = MARKET_TICKERS[symbol];
        if (!ticker) return price;
        
        if (ticker.baseCurrency === ticker.displayCurrency) {
            return price;
        }
        
        // Convert HKD to CNY (Chinese Renminbi)
        if (ticker.baseCurrency === 'HKD' && ticker.displayCurrency === 'CNY') {
            if (!_fxRates) {
                return price * 0.925; // fallback exchange rate
            }
            const cnyRate = _fxRates.CNY || 7.25;
            const hkdRate = _fxRates.HKD || 7.80;
            return price * (cnyRate / hkdRate);
        }
        
        return price;
    }

    function getPriceInUSD(price, currency) {
        if (currency === 'USD') return price;
        
        if (!_fxRates) {
            if (currency === 'EUR') return price * 1.08;
            if (currency === 'HKD') return price / 7.8;
            return price;
        }
        
        const base = currentDashboardSymbol === 'CO2.MI' ? 'EUR' : 'USD';
        
        if (base === 'EUR') {
            const usdRate = _fxRates.USD || 1.08;
            if (currency === 'EUR') return price * usdRate;
            const hkdRate = _fxRates.HKD || 8.4;
            return (price / hkdRate) * usdRate;
        } else {
            if (currency === 'EUR') {
                const eurRate = _fxRates.EUR || 0.92;
                return price / eurRate;
            }
            if (currency === 'HKD') {
                const hkdRate = _fxRates.HKD || 7.8;
                return price / hkdRate;
            }
            return price;
        }
    }

    function updateMarketOverviewMetrics() {
        let totalCapUSD = 0;
        let totalVolLots = 0;
        let activeCount = 0;

        for (const [symbol, price] of Object.entries(window.holdingsPrices)) {
            const vol = ASSET_NUMERIC_VOLUMES[symbol] || 0;
            const ticker = MARKET_TICKERS[symbol];
            if (!ticker) continue;
            const priceUSD = getPriceInUSD(price, ticker.baseCurrency);
            
            let multiplier = 1000;
            totalCapUSD += priceUSD * vol * multiplier;
            totalVolLots += vol;
            
            // Check if this market is open dynamically based on timezone and hours
            const config = MARKET_CONFIGS[symbol];
            if (config) {
                const now = getMarketTimeNow(config.timezone);
                const minutesNow = now.hour * 60 + now.minute;
                const isWeekend = (now.weekday === 'Sat' || now.weekday === 'Sun');
                const isOpen = !isWeekend && minutesNow >= config.openMin && minutesNow < config.closeMin;
                if (isOpen) {
                    activeCount++;
                }
            }
        }

        let formattedCap = '';
        if (totalCapUSD >= 1e9) {
            formattedCap = '$' + (totalCapUSD / 1e9).toFixed(2) + 'B';
        } else if (totalCapUSD >= 1e6) {
            formattedCap = '$' + (totalCapUSD / 1e6).toFixed(2) + 'M';
        } else {
            formattedCap = '$' + totalCapUSD.toLocaleString();
        }

        let formattedVol = '';
        if (totalVolLots >= 1e6) {
            formattedVol = (totalVolLots / 1e6).toFixed(2) + 'M';
        } else {
            formattedVol = totalVolLots.toLocaleString();
        }

        const capEl = document.getElementById('mktTotalCap');
        if (capEl) capEl.textContent = formattedCap;

        const volEl = document.getElementById('mktTotalVolume');
        if (volEl) volEl.textContent = formattedVol;

        const activeEl = document.getElementById('mktActiveCount');
        if (activeEl) activeEl.textContent = activeCount + '/' + Object.keys(MARKET_TICKERS).length;
    }

    const DONUT_COLORS = [
        'var(--signal)',   // EUA
        'var(--amber)',    // CCA
        'var(--electric)'  // CICC Carbon (China)
    ];

    window.hoverDonut = function(idx) {
        const symbols = Object.keys(MARKET_TICKERS);
        const symbol = symbols[idx];
        if (!symbol) return;
        const asset = MARKET_TICKERS[symbol];
        const vol = ASSET_NUMERIC_VOLUMES[symbol] || 0;
        const totalVol = symbols.reduce((acc, sym) => acc + (ASSET_NUMERIC_VOLUMES[sym] || 0), 0);
        const pct = ((vol / totalVol) * 100).toFixed(1);
        
        const centerPct = document.getElementById('donutCenterPct');
        const centerLabel = document.getElementById('donutCenterLabel');
        if (centerPct) centerPct.textContent = pct + '%';
        if (centerLabel) centerLabel.textContent = asset.sym;
    };

    window.unhoverDonut = function() {
        const centerPct = document.getElementById('donutCenterPct');
        const centerLabel = document.getElementById('donutCenterLabel');
        if (centerPct) centerPct.textContent = '100%';
        if (centerLabel) centerLabel.textContent = 'TOTAL';
    };

    function updateDonutChart() {
        const symbols = Object.keys(MARKET_TICKERS);
        const totalVol = symbols.reduce((acc, sym) => acc + (ASSET_NUMERIC_VOLUMES[sym] || 0), 0);
        
        let accumulatedPercent = 0;
        const legendContainer = document.getElementById('marketBreakdownLegend');
        let legendHtml = '';
        
        symbols.forEach((symbol, idx) => {
            const asset = MARKET_TICKERS[symbol];
            const vol = ASSET_NUMERIC_VOLUMES[symbol] || 0;
            const pct = (vol / totalVol) * 100;
            const strokeDash = (pct / 100) * 238.76;
            const strokeOffset = -((accumulatedPercent / 100) * 238.76);
            accumulatedPercent += pct;
            
            const segment = document.getElementById('donut-segment-' + idx);
            if (segment) {
                segment.setAttribute('stroke-dasharray', strokeDash.toFixed(2) + ' 238.76');
                segment.setAttribute('stroke-dashoffset', strokeOffset.toFixed(2));
                segment.setAttribute('stroke', DONUT_COLORS[idx]);
            }
            
            legendHtml += '<div style="display:flex; justify-content:space-between; align-items:center;" onmouseover="hoverDonut(' + idx + ')" onmouseout="unhoverDonut()">' +
                '<span style="color:' + DONUT_COLORS[idx] + '; cursor:pointer; font-weight:600;">● ' + asset.sym + '</span>' +
                '<span style="color:var(--t1); font-weight:600;">' + pct.toFixed(1) + '%</span>' +
                '</div>';
        });
        
        if (legendContainer) legendContainer.innerHTML = legendHtml;
    }

    function generateMiniSparklineSVG(history, isPositive) {
        if (!history || history.length < 2) return '';
        var min = Math.min.apply(null, history);
        var max = Math.max.apply(null, history);
        var range = max - min || 1;
        var width = 28;
        var height = 12;
        var points = history.map(function(val, idx) {
            var x = (idx / (history.length - 1)) * width;
            var y = height - 1 - ((val - min) / range) * (height - 2);
            return x.toFixed(1) + ',' + y.toFixed(1);
        });
        var color = isPositive ? 'var(--signal)' : 'var(--crimson)';
        return '<svg width="' + width + '" height="' + height + '" style="overflow:visible;display:block;"><polyline fill="none" stroke="' + color + '" stroke-width="1.2" points="' + points.join(' ') + '"/></svg>';
    }

    window.updateHoldingsTable = function() {
        const tbody = document.getElementById('terminalTableBody');

        // 1. Sort Tickers
        const sortedEntries = Object.entries(MARKET_TICKERS).sort(function(a, b) {
            const symA = a[0];
            const symB = b[0];
            const priceA = window.holdingsPrices[symA] || 0;
            const priceB = window.holdingsPrices[symB] || 0;
            const chgA = window.holdingsChanges[symA] || 0;
            const chgB = window.holdingsChanges[symB] || 0;
            const absChgA = (chgA * priceA) / 100;
            const absChgB = (chgB * priceB) / 100;
            const volA = ASSET_NUMERIC_VOLUMES[symA] || 0;
            const volB = ASSET_NUMERIC_VOLUMES[symB] || 0;

            let comparison = 0;
            if (currentTableSortKey === 'symbol') {
                comparison = a[1].sym.localeCompare(b[1].sym);
            } else if (currentTableSortKey === 'change') {
                comparison = chgB - chgA; // descending
            } else if (currentTableSortKey === 'price') {
                comparison = priceB - priceA; // descending
            } else if (currentTableSortKey === 'absChange') {
                comparison = absChgB - absChgA; // descending
            } else if (currentTableSortKey === 'volume') {
                comparison = volB - volA; // descending
            }
            
            return currentSortOrder === 'asc' ? -comparison : comparison;
        });

        // 2. Build rows
        let rowsHtml = '';
        sortedEntries.forEach(function(entry) {
            const symbol = entry[0];
            const asset = entry[1];
            const price = window.holdingsPrices[symbol] || 0;
            const chg = window.holdingsChanges[symbol] || 0;
            const absChg = (chg * price) / 100;
            const displayPrice = asset.baseCurrency === 'EUR' ? '€' + price.toFixed(2) : '$' + price.toFixed(2);
            const absChgSign = absChg >= 0 ? '+' : '';
            const absChgDisplay = asset.baseCurrency === 'EUR' ? absChgSign + '€' + Math.abs(absChg).toFixed(2) : absChgSign + '$' + Math.abs(absChg).toFixed(2);
            const chgSign = chg >= 0 ? '+' : '';
            const chgClass = chg > 0 ? 'pos' : (chg < 0 ? 'neg' : 'neu');
            const meta = ASSET_METADATA[symbol] || { name: symbol, volume: '0.00M' };
            const spark = generateSparklineSVG(window.holdingsHistory[symbol], chg >= 0);
            
            const activeClass = currentDashboardSymbol === symbol ? 'class="active-row"' : '';

            rowsHtml += '<tr ' + activeClass + ' onclick="onMarketAssetChange(\'' + symbol + '\')" id="term-row-' + symbol + '" tabindex="0" onkeydown="if(event.key===\'Enter\') onMarketAssetChange(\'' + symbol + '\')">' +
                '<td style="font-weight:700; color:var(--t1); padding-left:16px;">' + asset.sym + '</td>' +
                '<td style="color:var(--t3);">' + meta.name + '</td>' +
                '<td class="term-cell-dim" style="font-size:10px;">' + asset.exch + '</td>' +
                '<td class="th-right term-cell-price" style="font-weight:600; text-align:right;" id="cell-price-' + symbol + '">' + displayPrice + '</td>' +
                '<td class="th-right ' + chgClass + '" style="font-weight:600; text-align:right;" id="cell-abs-chg-' + symbol + '">' + absChgDisplay + '</td>' +
                '<td class="th-right ' + chgClass + '" style="font-weight:600; text-align:right;" id="cell-chg-' + symbol + '">' + chgSign + chg.toFixed(2) + '%</td>' +
                '<td class="th-right term-cell-dim" style="font-size:10px; text-align:right;">' + meta.volume + '</td>' +
                '<td style="text-align:center; padding-right:16px;">' + spark + '</td>' +
                '</tr>';
        });

        if (tbody) {
            tbody.innerHTML = rowsHtml;
        }

        // 3. Render Relative Performance Progress Bars/Chart
        renderPerformanceChart();

        // 4. Update Overview Strip Tickers
        updateOverviewStripTickers();

        // 5. Update overall sentiment value
        updateOverallSentiment();

        // 6. Update Market Overview stats
        updateMarketOverviewMetrics();

        // 7. Update Donut Chart
        updateDonutChart();

        // 8. Update Order Ticket with the latest live price estimation
        if (typeof updateOrderTicketEstimation === 'function') {
            updateOrderTicketEstimation();
        }
    }

    function updateOverviewStripTickers() {
        const container = document.getElementById('mktStripTickers');
        if (!container) return;

        let html = '';
        for (const [symbol, asset] of Object.entries(MARKET_TICKERS)) {
            const price = window.holdingsPrices[symbol] || 0;
            const chg = window.holdingsChanges[symbol] || 0;
            const isPos = chg >= 0;
            const color = isPos ? 'var(--signal)' : 'var(--crimson)';
            const displayPrice = asset.baseCurrency === 'EUR' ? '€' + price.toFixed(2) : '$' + price.toFixed(2);
            const indicator = isPos ? '▲' : '▼';
            const miniSpark = generateMiniSparklineSVG(window.holdingsHistory[symbol], isPos);

            html += '<div class="mkt-mini-card" onclick="onMarketAssetChange(\'' + symbol + '\')" style="cursor:pointer; display:flex; align-items:center; gap:8px;">' +
                '<span style="color:var(--t1); font-weight:700;">' + asset.sym + '</span>' +
                '<span style="color:var(--t2); font-family:var(--mono);">' + displayPrice + '</span>' +
                '<span style="color:' + color + '; font-weight:600; font-size:10px; display:flex; align-items:center; gap:2px;">' +
                '<span>' + indicator + '</span><span>' + chg.toFixed(2) + '%</span>' +
                '</span>' +
                '<div style="margin-left:4px;">' + miniSpark + '</div>' +
                '</div>';
        }
        container.innerHTML = html;
    }

    function updateOverallSentiment() {
        const sentimentVal = document.getElementById('marketSentimentVal');
        if (!sentimentVal) return;

        let posCount = 0;
        let negCount = 0;
        for (const chg of Object.values(window.holdingsChanges)) {
            if (chg > 0) posCount++;
            else if (chg < 0) negCount++;
        }

        if (posCount > negCount) {
            sentimentVal.textContent = 'BULLISH';
            sentimentVal.className = 'pos';
            sentimentVal.style.color = 'var(--signal)';
        } else if (negCount > posCount) {
            sentimentVal.textContent = 'BEARISH';
            sentimentVal.className = 'neg';
            sentimentVal.style.color = 'var(--amber)';
        } else {
            sentimentVal.textContent = 'NEUTRAL';
            sentimentVal.className = 'neu';
            sentimentVal.style.color = 'var(--t3)';
        }
    }

    const syncLogs = [];
    function logSync(msg, type = 'INFO') {
        const ts = new Date().toLocaleTimeString();
        syncLogs.push(`<div>[${ts}] [${type}] ${msg}</div>`);
        if (syncLogs.length > 30) syncLogs.shift();
        const cliEl = document.getElementById('termConsole') || document.getElementById('cliLogs');
        if (cliEl) {
            cliEl.innerHTML = syncLogs.join('');
        }
    }

    const MARKET_TICKERS = {
        'CO2.MI': { sym: 'EUA=F', exch: 'ICE ECX', baseCurrency: 'EUR', displayCurrency: 'EUR' },
        'KCCA': { sym: 'CCA', exch: 'NYSE ARCA', baseCurrency: 'USD', displayCurrency: 'USD' },
        '3060.HK': { sym: '3060.HK', exch: 'HKEX', baseCurrency: 'HKD', displayCurrency: 'CNY' }
    };

    function old_unused_updateHoldingsTable() {
        const tbody = null;
        if (!tbody) return;

        let rowsHtml = '';
        for (const [symbol, asset] of Object.entries(MARKET_TICKERS)) {
            const price = window.holdingsPrices[symbol] || 0;
            const chg = window.holdingsChanges[symbol] || 0;
            const displayPrice = asset.baseCurrency === 'EUR' ? `€${price.toFixed(2)}` : `$${price.toFixed(2)}`;
            
            const chgSign = chg > 0 ? '+' : '';
            const chgClass = chg > 0 ? 'pos' : (chg < 0 ? 'neg' : 'neu');
            
            rowsHtml += `
                <div class="dash-row" id="dash-row-${symbol}">
                    <span style="font-weight:700; color:var(--t1);">${asset.sym}</span>
                    <span class="term-cell-dim">${asset.exch}</span>
                    <span class="th-right term-cell-price">${displayPrice}</span>
                    <span class="th-right ${chgClass}">${chgSign}${chg.toFixed(2)}%</span>
                </div>
            `;
        }
        tbody.innerHTML = rowsHtml;
    }

    // ─── WAIT FOR CONTAINER WIDTH ────────────────────────────────────
    function whenContainerReady(id, cb, attempts = 0) {
        const el = document.getElementById(id);
        if (el && el.offsetWidth > 0) {
            requestAnimationFrame(cb);
            return;
        }
        if (attempts > 40) {
            console.warn('whenContainerReady: "' + id + '" never reached non-zero width, initializing anyway.');
            cb();
            return;
        }
        requestAnimationFrame(function() { whenContainerReady(id, cb, attempts + 1); });
    }

    // ─── NAVIGATION ──────────────────────────────────────────────────
    window.navigateTo = function(page, el) {
        // Remove active from all desktop nav links
        document.querySelectorAll('.nav-link').forEach(function(x) { x.classList.remove('active'); });
        // If a specific element was passed, activate it; otherwise find it by data-page
        if (el) {
            el.classList.add('active');
        } else {
            var pageKey = page === 'dashboard-policy' ? 'dashboard-policy' : page;
            var navEl = document.querySelector('.nav-link[data-page="' + pageKey + '"]');
            if (navEl) navEl.classList.add('active');
        }

        if (page === 'news') {
            window.showPage('news');
            window.fetchCarbonNews();
        } else if (page === 'landing') {
            showPage('landing');
        } else if (page === 'carbon') {
            showPage('carbon');
            if (!window._carbonInited) { initCarbonPage();
                window._carbonInited = true; }
        } else if (page === 'ai-explainer') {
            showPage('ai-explainer');
        }
        closeMM();
    }

    // ─── PAGE CONTROL ──────────────────────────────────────────────────
    window.showPage = function(page, tab) {
        document.getElementById('page-landing').style.display = 'none';
        document.getElementById('page-auth').style.display = 'none';
        document.getElementById('page-dashboard').style.display = 'none';
        document.getElementById('page-carbon').style.display = 'none';
        document.getElementById('page-ai-explainer').style.display = 'none';
        document.getElementById('page-news').style.display = 'none';
        document.getElementById('ticker').style.display = (page === 'dashboard') ? 'none' : 'flex';

        if (page === 'news') {
            document.getElementById('page-news').style.display = 'block';
            document.getElementById('nav').style.display = 'flex';
            updateNavForAuth(!!window.currentUser);
            initReveal('page-news');
        } else if (page === 'landing') {
            document.getElementById('page-landing').style.display = 'block';
            document.getElementById('nav').style.display = 'flex';
            updateNavForAuth(!!currentUser);
            if (!chartsInit) { whenContainerReady('landingChart', window.initLandingCharts);
                chartsInit = true; }
            initReveal('page-landing');
        } else if (page === 'auth') {
            document.getElementById('page-auth').style.display = 'flex';
            document.getElementById('nav').style.display = 'flex';
            if (tab) switchAuthTab(tab);
        } else if (page === 'dashboard') {
            document.getElementById('page-dashboard').style.display = 'block';
            document.getElementById('nav').style.display = 'none';
            if (!dashChartsInit) { whenContainerReady('dashPriceChart', window.initDashCharts);
                dashChartsInit = true; }
            updateSidebarUser();
        } else if (page === 'carbon') {
            document.getElementById('page-carbon').style.display = 'block';
            document.getElementById('nav').style.display = 'flex';
            updateNavForAuth(!!currentUser);
            if (!window._carbonInited) { whenContainerReady('systemGrid', initCarbonPage);
                window._carbonInited = true; }
            initReveal('page-carbon');
            animateCarbonStats();
        } else if (page === 'ai-explainer') {
            document.getElementById('page-ai-explainer').style.display = 'block';
            document.getElementById('nav').style.display = 'flex';
            updateNavForAuth(!!currentUser);
            if (!window._aiExplainerInited) { whenContainerReady('neuroCanvas', initAIExplainer);
                window._aiExplainerInited = true; }
            initReveal('page-ai-explainer');
        }
        window.scrollTo(0, 0);
    }

    function animateValue(id, start, end, duration, suffix = "", decimals = 0) {
        const obj = document.getElementById(id);
        if (!obj) return;
        let startTimestamp = null;
        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            const ease = progress * (2 - progress);
            const val = start + ease * (end - start);
            if (suffix === "€") {
                obj.textContent = "€" + val.toFixed(decimals);
            } else {
                obj.textContent = val.toFixed(decimals) + suffix;
            }
            if (progress < 1) {
                window.requestAnimationFrame(step);
            }
        };
        window.requestAnimationFrame(step);
    }

    function animateCarbonStats() {
        animateValue("counterSystems", 0, 35, 1000, "+");
        animateValue("counterInstruments", 0, 87, 1000, "+");
        animateValue("counterCoverage", 0, 23, 1000, "%");
        const euaPrice = (typeof heroPrices !== "undefined" && heroPrices.EUA && heroPrices.EUA.price) || 63.45;
        animateValue("counterPrice", 0, euaPrice, 1000, "€", 2);
    }

    function updateNavForAuth(loggedIn) {
        // Update desktop nav actions
        var ra = document.querySelector('.nav-actions');
        if (ra) {
            if (loggedIn) {
                ra.innerHTML =
                    '<button class="btn-gold" onclick="showPage(\'dashboard\')">Open Dashboard</button><button class="nav-ham" id="navHam" onclick="toggleMobileMenu()" aria-label="Menu"><span></span><span></span><span></span></button>';
            } else {
                ra.innerHTML =
                    '<button class="btn-ghost" onclick="showPage(\'auth\',\'signin\')">Sign In</button><button class="btn-gold" onclick="showPage(\'auth\',\'signup\')">Get Started</button><button class="nav-ham" id="navHam" onclick="toggleMobileMenu()" aria-label="Menu"><span></span><span></span><span></span></button>';
            }
        }
        // Update mobile menu auth actions
        var ma = document.querySelector('.mob-actions');
        if (ma) {
            if (loggedIn) {
                ma.innerHTML =
                    '<button class="btn-gold" style="width:100%;padding:13px;font-size:14px" onclick="showPage(\'dashboard\');closeMM()">Open Dashboard</button>';
            } else {
                ma.innerHTML =
                    '<button class="btn-ghost" style="width:100%;padding:13px;font-size:14px" onclick="showPage(\'auth\',\'signin\');closeMM()">Sign In</button>' +
                    '<button class="btn-gold" style="width:100%;padding:13px;font-size:14px" onclick="showPage(\'auth\',\'signup\');closeMM()">Get Started Free</button>';
            }
        }
    }

    // ─── MOBILE MENU ──────────────────────────────────────────────────
    function toggleDashMenu() {
        var sidebar = document.getElementById('sidebar');
        var overlay = document.getElementById('sidebarOverlay');
        var ham = document.getElementById('dashHam');
        if (sidebar) sidebar.classList.toggle('mob-open');
        if (overlay) overlay.classList.toggle('mob-open');
        if (ham) ham.classList.toggle('open');
    }

    function toggleMobileMenu() {
        var menu = document.getElementById('mobileMenu');
        var ham = document.getElementById('navHam');
        if (!ham) return;
        menu.classList.toggle('open');
        ham.classList.toggle('open');
    }

    function closeMM() {
        document.getElementById('mobileMenu').classList.remove('open');
        var h = document.getElementById('navHam');
        if (h) h.classList.remove('open');
    }

    // ─── AUTH ──────────────────────────────────────────────────────────
    function switchAuthTab(tab) {
        document.getElementById('form-signin').style.display = tab === 'signin' ? 'block' : 'none';
        document.getElementById('form-signup').style.display = tab === 'signup' ? 'block' : 'none';
        document.getElementById('tab-signin').classList.toggle('active', tab === 'signin');
        document.getElementById('tab-signup').classList.toggle('active', tab === 'signup');
        var link = document.getElementById('auth-toggle-link');
        link.innerHTML = tab === 'signin' ?
            'Don\'t have an account? <a onclick="switchAuthTab(\'signup\')">Create one</a>' :
            'Already have an account? <a onclick="switchAuthTab(\'signin\')">Sign in</a>';
    }

    function togglePass(id, btn) {
        var input = document.getElementById(id);
        if (input.type === 'password') { input.type = 'text';
            btn.textContent = '🙈'; } else { input.type = 'password';
            btn.textContent = '👁'; }
    }

    function doSignIn() {
        var email = document.getElementById('si-email').value.trim();
        var pass = document.getElementById('si-pass').value;
        document.getElementById('err-signin').classList.remove('show');
        if (!email || !pass) {
            document.getElementById('err-signin').classList.add('show');
            document.getElementById('err-signin').textContent = 'Please enter your email and password.';
            return;
        }
        currentUser = { name: email.split('@')[0].replace(/\./g, ' '), email: email, initials: email[0].toUpperCase() };
        showPage('dashboard');
        updateNavForAuth(true);
        if (pendingPanel) { window.switchPanel(pendingPanel, document.querySelector(pendingPanel === 'policy' ? '.sb-item:nth-child(4)' : '.sb-item:nth-child(3)'));
            pendingPanel = null; }
    }

    function doSignUp() {
        var first = document.getElementById('su-first').value.trim();
        var last = document.getElementById('su-last').value.trim();
        var email = document.getElementById('su-email').value.trim();
        var pass = document.getElementById('su-pass').value;
        document.getElementById('err-signup').classList.remove('show');
        if (!first || !last || !email || pass.length < 6) {
            document.getElementById('err-signup').classList.add('show');
            document.getElementById('err-signup').textContent = !email ? 'Please enter a valid email.' : pass.length < 6 ?
                'Password must be at least 6 characters.' : 'Please fill in all required fields.';
            return;
        }
        currentUser = { name: first + ' ' + last, email: email, initials: first[0].toUpperCase() };
        showPage('dashboard');
        updateNavForAuth(true);
        if (pendingPanel) { window.switchPanel(pendingPanel, document.querySelector(pendingPanel === 'policy' ? '.sb-item:nth-child(4)' : '.sb-item:nth-child(3)'));
            pendingPanel = null; }
    }

    function doSignOut() {
        currentUser = null;
        showPage('landing');
        updateNavForAuth(false);
    }

    function updateSidebarUser() {
        if (!currentUser) return;
        var nameEl = document.getElementById('sb-name');
        var avEl = document.getElementById('sb-avatar');
        if (nameEl) nameEl.textContent = currentUser.name;
        if (avEl) avEl.textContent = currentUser.initials;
    }

// ─── SCROLL REVEAL ──────────────────────────────────────────────────
    function initReveal(pageId) {
        var selector = pageId ? '#' + pageId + ' .reveal' : '.reveal';
        var observer = new IntersectionObserver(function(entries) {
            entries.forEach(function(e) {
                if (e.isIntersecting) {
                    e.target.classList.add('visible');
                    observer.unobserve(e.target);
                }
            });
        }, { threshold: .08 });
        
        document.querySelectorAll(selector).forEach(function(el) {
            el.classList.remove('visible');
            observer.observe(el);
        });
    }

    // ─── CHAT ──────────────────────────────────────────────────────────
    var chatOpen = { v: false };

    function toggleChat() {
        chatOpen.v = !chatOpen.v;
        document.getElementById('chatPanel').classList.toggle('open', chatOpen.v);
    }

    var BOTS = {
        friday: function() {
            return 'Based on LSTM 14-day model, EUA prices are projected to reach <b>€65.20–€66.10</b> by Friday — a +' +
                (2.8 + Math.random()).toFixed(1) + '% gain from today\'s close. Confidence: 73%.';
        },
        ccm: '<b>Compliance Carbon Markets (CCM)</b> are legally mandated cap-and-trade systems. Regulated entities must surrender allowances equal to verified annual emissions or face penalties up to €100/tCO₂ in the EU ETS.',
        vcm: '<b>Voluntary Carbon Markets (VCM)</b> let companies offset beyond their legal obligations. Credits are verified by third-party standards like Verra VCS or Gold Standard — no legal mandate applies.',
        fit: '<b>Fit for 55</b> is the EU\'s legislative package targeting a 55% net GHG reduction by 2030 vs 1990 levels. It significantly tightens the EU ETS cap, introduces CBAM, and extends ETS to maritime and buildings.',
        policy: 'Latest policy: EU revised MSR intervention threshold under Phase 4 (June 2025). CBAM Phase 2 entered full effect Q2 2025. UK ETS–EU ETS linking talks resumed April 2025. Aviation free allowance phase-out accelerated by 18 months.',
        default: 'I can analyse EU ETS price drivers, LSTM model outputs, policy impacts (Fit for 55, CBAM), and compare CCM vs VCM markets. What would you like to explore?'
    };

    function getReply(m) {
        var t = m.toLowerCase();
        if (t.includes('friday') || t.includes('forecast') || t.includes('predict')) return BOTS.friday();
        if (t.includes('ccm') || t.includes('compliance')) return BOTS.ccm;
        if (t.includes('vcm') || t.includes('voluntary')) return BOTS.vcm;
        if (t.includes('fit') || t.includes('55')) return BOTS.fit;
        if (t.includes('policy') || t.includes('cbam') || t.includes('update')) return BOTS.policy;
        return BOTS.default;
    }

    function appendMsg(text, role) {
        var body = document.getElementById('chatBody');
        var div = document.createElement('div');
        div.className = 'msg ' + role;
        div.innerHTML = text;
        body.appendChild(div);
        body.scrollTop = body.scrollHeight;
        return div;
    }

    function sendMsg() {
        var inp = document.getElementById('chatInput');
        var val = inp.value.trim();
        if (!val) return;
        appendMsg(val, 'user');
        inp.value = '';
        var typDiv = document.createElement('div');
        typDiv.className = 'msg bot';
        typDiv.innerHTML = '<div class="typing-dot"><span></span><span></span><span></span></div>';
        document.getElementById('chatBody').appendChild(typDiv);
        document.getElementById('chatBody').scrollTop = 9999;
        setTimeout(function() {
            typDiv.remove();
            var reply = getReply(val);
            var i = 0;
            var div = appendMsg('', 'bot');
            var iv = setInterval(function() {
                div.innerHTML = reply.substring(0, i += 4);
                document.getElementById('chatBody').scrollTop = 9999;
                if (i >= reply.length) clearInterval(iv);
            }, 14);
        }, 700);
    }

    function quickSend(t) { document.getElementById('chatInput').value = t;
        sendMsg(); }

    // ─── CARBON PAGE INIT ──────────────────────────────────────────────
    var _carbonSystems = [
        { name: 'EU ETS', region: '🇪🇺 Europe', price: '€63.45', mech: 'increment', desc: 'Phase 4 · 4.3% LRF · 40% EU GHG', tags: ['Largest', 'Most liquid'], major: true },
        { name: 'California CCA', region: '🇺🇸 USA', price: '$14.80', mech: 'market', desc: 'Cap-and-trade · linked RGGI · 85% coverage', tags: ['Price floor', 'Quarterly auctions'], major: true },
        { name: 'UK ETS', region: '🇬🇧 UK', price: '£38.75', mech: 'increment', desc: 'Post-Brexit · tighter cap', tags: ['Linking talks'], major: true },
        { name: 'China CETS', region: '🇨🇳 China', price: '¥68.50', mech: 'fixed', desc: 'World\'s largest by volume · power sector', tags: ['4.5B tCO₂', 'Fixed price'], major: true },
        { name: 'Korea ETS', region: '🇰🇷 S.Korea', price: '₩45,200', mech: 'increment', desc: 'Phase 3 · 600+ entities', tags: ['74% auction'], major: true },
        { name: 'RGGI', region: '🇺🇸 US East', price: '$6.80', mech: 'market', desc: '12 states · power sector', tags: ['30% cap reduction'], major: true },
        { name: 'Mexico ETS', region: '🇲🇽 Mexico', price: 'MX$820', mech: 'fixed', desc: 'Pilot phase · voluntary', tags: ['Fixed price'], major: false },
        { name: 'Colombia ETS', region: '🇨🇴 Colombia', price: 'COP 35,000', mech: 'fixed', desc: 'Emerging market · pilot', tags: ['Fixed price'], major: false },
        { name: 'South Africa', region: '🇿🇦 S.Africa', price: 'ZAR 120', mech: 'fixed', desc: 'Carbon tax · fixed price', tags: ['Tax-based'], major: false },
        { name: 'Japan GX', region: '🇯🇵 Japan', price: '¥1,200', mech: 'market', desc: 'Green Transformation · voluntary', tags: ['Voluntary'], major: false },
        { name: 'Australia', region: '🇦🇺 Australia', price: 'A$42', mech: 'market', desc: 'Safeguard mechanism · market', tags: ['Market-based'], major: false },
        { name: 'New Zealand', region: '🇳🇿 NZ', price: 'NZ$78', mech: 'market', desc: 'NZ ETS · all sectors', tags: ['All sectors'], major: false }
    ];

    window.filterCarbonSystems = function(type) {
        var btns = document.querySelectorAll('.sys-filter-btn');
        btns.forEach(function(b) {
            b.classList.remove('active');
            b.style.background = 'var(--bg2)';
            b.style.color = 'var(--t2)';
            b.style.borderColor = 'var(--b2)';
        });
        var activeBtn = document.getElementById('btn-sys-' + type);
        if (activeBtn) {
            activeBtn.classList.add('active');
            activeBtn.style.background = 'var(--bg3)';
            activeBtn.style.color = 'var(--gold)';
            activeBtn.style.borderColor = 'var(--gold-dim)';
        }

        var filtered = _carbonSystems;
        if (type === 'emerging') {
            filtered = _carbonSystems.filter(function(s) { return !s.major; });
        }

        var grid = document.getElementById('systemGrid');
        if (grid) {
            grid.innerHTML = '';
            filtered.forEach(function(s) {
                var mechClass = s.mech === 'fixed' ? 'sys-fixed' : s.mech === 'increment' ? 'sys-increment' : 'sys-market';
                var mechLabel = s.mech === 'fixed' ? '● Fixed' : s.mech === 'increment' ? '◆ 5‑Year Inc.' : '◉ Market';
                var div = document.createElement('div');
                div.className = 'system-card';
                div.innerHTML =
                    '<div class="sys-name">' + s.name + '</div>' +
                    '<div class="sys-region">' + s.region + '</div>' +
                    '<div class="sys-price">' + s.price + '</div>' +
                    '<span class="sys-mech ' + mechClass + '">' + mechLabel + '</span>' +
                    '<div class="sys-desc">' + s.desc + '</div>' +
                    '<div class="tx-tags" style="margin-top:6px">' + s.tags.map(function(t) { return '<span class="ttag">' + t + '</span>'; }).join('') + '</div>';
                grid.appendChild(div);
            });
        }
    };

    function initCarbonPage() {
        filterCarbonSystems('emerging');

        var counters = [
            { el: 'counterSystems', target: 35, suffix: '+' },
            { el: 'counterInstruments', target: 87, suffix: '+' },
            { el: 'counterCoverage', target: 23, suffix: '%' },
            { el: 'counterPrice', target: 63.45, prefix: '€', suffix: '', decimals: 2 },
        ];

        counters.forEach(function(c) {
            var el = document.getElementById(c.el);
            if (!el) return;
            var duration = 2000;
            var startTime = performance.now();
            var startVal = 0;
            var target = c.target;
            var isFloat = Number.isFinite(target) && !Number.isInteger(target);

            function updateCounter(now) {
                var progress = Math.min(1, (now - startTime) / duration);
                var eased = 1 - Math.pow(1 - progress, 3);
                var current = startVal + (target - startVal) * eased;
                var display;
                if (isFloat) {
                    display = (c.prefix || '') + current.toFixed(c.decimals || 2) + (c.suffix || '');
                } else {
                    display = (c.prefix || '') + Math.floor(current) + (c.suffix || '');
                }
                el.textContent = display;
                if (progress < 1) requestAnimationFrame(updateCounter);
                else {
                    el.textContent = (c.prefix || '') + (isFloat ? target.toFixed(c.decimals || 2) : target) + (c.suffix ||
                        '');
                }
            }
            requestAnimationFrame(updateCounter);
        });
    }

    // ─── AI EXPLAINER PAGE INIT ────────────────────────────────────────
    function initAIExplainer() {
        var counters = [
            { el: 'aiCounterMape', target: 3.8, suffix: '%', decimals: 1 },
            { el: 'aiCounterSharpe', target: 1.42, suffix: '', decimals: 2 },
        ];
        counters.forEach(function(c) {
            var el = document.getElementById(c.el);
            if (!el) return;
            var duration = 1600;
            var startTime = performance.now();

            function tick(now) {
                var progress = Math.min(1, (now - startTime) / duration);
                var eased = 1 - Math.pow(1 - progress, 3);
                el.textContent = (c.target * eased).toFixed(c.decimals) + c.suffix;
                if (progress < 1) requestAnimationFrame(tick);
                else el.textContent = c.target.toFixed(c.decimals) + c.suffix;
            }
            requestAnimationFrame(tick);
        });

        initNeuroCanvas();
    }

    function initNeuroCanvas() {
        var canvas = document.getElementById('neuroCanvas');
        if (!canvas || canvas._inited) return;
        canvas._inited = true;
        var ctx = canvas.getContext('2d');
        var dpr = Math.min(window.devicePixelRatio || 1, 2);

        var layers = [4, 6, 6, 3];
        var nodes = [];
        var W = 0,
            H = 0;

        function layout() {
            var rect = canvas.getBoundingClientRect();
            W = rect.width;
            H = rect.height;
            canvas.width = W * dpr;
            canvas.height = H * dpr;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            nodes = layers.map(function(count, li) {
                var x = (W / (layers.length - 1)) * li;
                return Array.from({ length: count }, function(_, ni) {
                    return {
                        x: x,
                        y: (H / (count + 1)) * (ni + 1),
                        pulse: Math.random() * Math.PI * 2,
                    };
                });
            });
        }

        var reduceMotion = window.matchMedia('(prefers-reduced-motion:reduce)').matches;
        var t = 0;

        function draw() {
            ctx.clearRect(0, 0, W, H);

            for (var li = 0; li < nodes.length - 1; li++) {
                nodes[li].forEach(function(a, ai) {
                    nodes[li + 1].forEach(function(b, bi) {
                        var flow = (Math.sin(t * 0.9 + ai * 0.7 + bi * 0.3 + li) + 1) / 2;
                        ctx.strokeStyle = 'rgba(201,168,76,' + (0.05 + flow * 0.14) + ')';
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.moveTo(a.x, a.y);
                        ctx.lineTo(b.x, b.y);
                        ctx.stroke();
                    });
                });
            }

            nodes.forEach(function(layer, li) {
                layer.forEach(function(n) {
                    var glow = (Math.sin(t * 1.4 + n.pulse) + 1) / 2;
                    var isOutput = li === nodes.length - 1;
                    var baseColor = isOutput ? '0,212,170' : '201,168,76';
                    var r = 3.2 + glow * 2.2;
                    var grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * 3.2);
                    grad.addColorStop(0, 'rgba(' + baseColor + ',' + (0.55 + glow * 0.35) + ')');
                    grad.addColorStop(1, 'rgba(' + baseColor + ',0)');
                    ctx.fillStyle = grad;
                    ctx.beginPath();
                    ctx.arc(n.x, n.y, r * 3.2, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.fillStyle = 'rgba(' + baseColor + ',0.95)';
                    ctx.beginPath();
                    ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
                    ctx.fill();
                });
            });

            t += 0.012;
            if (!reduceMotion) requestAnimationFrame(draw);
        }

        layout();
        draw();
        window.addEventListener('resize', function() { layout(); });
    }

// ─── RESIZE HOOK ────────────────────────────────────────────────────
    window.addEventListener('resize', function() {
        if (dashChart) dashChart.updateOptions({}, false, true);
    });

    // ─── INIT ──────────────────────────────────────────────────────────
    window.addEventListener('DOMContentLoaded', function() {
        showPage('landing');
        // Kick off live FX fetch on page load
        fetchFXRates();
        window.initHeroInstrumentPanel();
    });

    if (window.matchMedia('(prefers-reduced-motion:reduce)').matches) {
        document.querySelectorAll('.orb').forEach(function(o) { o.style.animation = 'none'; });
        document.querySelectorAll('.ticker-wrap').forEach(function(t) { t.style.animation = 'none'; });
    }
    
    // ══ CARBON MESH HERO CANVAS ══
    function initCarbonMeshCanvas() {
        const canvas = document.getElementById('carbonMeshCanvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        let W, H, pts;
        function resize() {
            W = canvas.width = canvas.offsetWidth;
            H = canvas.height = canvas.offsetHeight;
            pts = Array.from({length:28}, () => ({
                x: Math.random()*W, y: Math.random()*H,
                vx: (Math.random()-.5)*.4, vy: (Math.random()-.5)*.4,
                r: Math.random()*2+1.5
            }));
        }
        resize();
        window.addEventListener('resize', resize);
        function draw() {
            ctx.clearRect(0,0,W,H);
            // Draw connections
            for (let i=0;i<pts.length;i++) for (let j=i+1;j<pts.length;j++) {
                const dx=pts[i].x-pts[j].x, dy=pts[i].y-pts[j].y, d=Math.sqrt(dx*dx+dy*dy);
                if (d<120) {
                    ctx.beginPath(); ctx.moveTo(pts[i].x,pts[i].y); ctx.lineTo(pts[j].x,pts[j].y);
                    ctx.strokeStyle='rgba(0,212,170,'+(0.15*(1-d/120))+')'; ctx.lineWidth=.7; ctx.stroke();
                }
            }
            // Draw dots
            pts.forEach(p => {
                ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
                ctx.fillStyle='rgba(0,212,170,.5)'; ctx.fill();
                p.x+=p.vx; p.y+=p.vy;
                if (p.x<0||p.x>W) p.vx*=-1;
                if (p.y<0||p.y>H) p.vy*=-1;
            });
            requestAnimationFrame(draw);
        }
        draw();
    }

    // ══ WORLD MAP CANVAS ══
    function initWorldMapCanvas() {
        const canvas = document.getElementById('worldMapCanvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const W = 820, H = 400;
        canvas.width = W; canvas.height = H;

        // Background
        ctx.fillStyle = '#080f1a';
        ctx.fillRect(0,0,W,H);

        // Grid lines
        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        ctx.lineWidth = 1;
        for (let x=0;x<W;x+=40) { ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke(); }
        for (let y=0;y<H;y+=40) { ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke(); }

        // ETS system dots [x%, y%, size, color, label]
        const systems = [
            [0.46,0.33,8,'#00d4aa','EU ETS'],
            [0.51,0.26,5,'#00d4aa','UK ETS'],
            [0.16,0.35,6,'#00d4aa','CCA/RGGI'],
            [0.74,0.31,10,'#00d4aa','China CETS'],
            [0.79,0.40,6,'#00d4aa','Korea ETS'],
            [0.18,0.54,5,'#f5a623','Mexico'],
            [0.22,0.57,4,'#f5a623','Colombia'],
            [0.57,0.65,5,'#f5a623','South Africa'],
            [0.82,0.47,4,'#f5a623','Japan Pilot'],
            [0.78,0.34,5,'#00d4aa','Taiwan ETS'],
            [0.45,0.30,4,'#00d4aa','Switzerland'],
            [0.47,0.28,4,'#00d4aa','Norway'],
            [0.12,0.33,4,'#f5a623','Wash. State'],
            [0.49,0.35,4,'#00d4aa','CBAM'],
            [0.83,0.53,4,'#f5a623','NZ ETS'],
        ];

        systems.forEach(([xp,yp,size,color,label]) => {
            const x = xp*W, y = yp*H;
            // Glow
            const g = ctx.createRadialGradient(x,y,0,x,y,size*3);
            g.addColorStop(0,color+'44'); g.addColorStop(1,'transparent');
            ctx.beginPath(); ctx.arc(x,y,size*3,0,Math.PI*2);
            ctx.fillStyle=g; ctx.fill();
            // Dot
            ctx.beginPath(); ctx.arc(x,y,size,0,Math.PI*2);
            ctx.fillStyle=color; ctx.fill();
        });

        // Animate pulsing dots
        let frame=0;
        function animate() {
            ctx.clearRect(0,0,W,H);
            ctx.fillStyle='#080f1a'; ctx.fillRect(0,0,W,H);
            ctx.strokeStyle='rgba(255,255,255,0.04)'; ctx.lineWidth=1;
            for (let x=0;x<W;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
            for (let y=0;y<H;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}

            const pulse = 0.5+0.5*Math.sin(frame/30);
            systems.forEach(([xp,yp,size,color,label]) => {
                const x=xp*W, y=yp*H;
                const ps = size*(1+pulse*0.5);
                const g=ctx.createRadialGradient(x,y,0,x,y,ps*4);
                g.addColorStop(0,color+'33'); g.addColorStop(1,'transparent');
                ctx.beginPath();ctx.arc(x,y,ps*4,0,Math.PI*2);
                ctx.fillStyle=g;ctx.fill();
                ctx.beginPath();ctx.arc(x,y,size,0,Math.PI*2);
                ctx.fillStyle=color;ctx.fill();
                // Label
                ctx.fillStyle='rgba(255,255,255,0.55)';
                ctx.font='8px monospace';
                ctx.fillText(label,x+size+3,y+3);
            });
            frame++;
            requestAnimationFrame(animate);
        }
        animate();
    }

    // Init these when carbon page is shown
    const _origNav = typeof navigateTo === 'function' ? navigateTo : null;
    function initCarbonPageCanvases() {
        setTimeout(() => {
            initCarbonMeshCanvas();
            initWorldMapCanvas();
        }, 100);
    }
    // Hook into page navigation
    document.addEventListener('DOMContentLoaded', () => {
        // Check if carbon page is visible on load
        const cp = document.getElementById('page-carbon');
        if (cp && cp.style.display !== 'none' && cp.offsetParent !== null) {
            initCarbonPageCanvases();
        }
    });
    // Also try when page shown via navigateTo
    (function patchNav() {
        const orig = window.navigateTo;
        if (typeof orig === 'function') {
            window.navigateTo = function(page, ...args) {
                orig.call(this, page, ...args);
                if (page === 'carbon') initCarbonPageCanvases();
            };
        }
    })();

    // News API Integration
    window.newsFetched = false;
    window.fetchCarbonNews = async function() {
        if (window.newsFetched) return; // Only fetch once to save API quota
        
        const apiKey = '8203ca35fa43ce8d6354bef20fb133a0';
        const query = 'carbon OR "carbon credits" OR "carbon permits" OR emissions OR "climate change" OR "net zero" OR decarbonization';
        const url = `/api/news`;
        
        const container = document.getElementById('news-container');
        const pubContainer = document.getElementById('public-news-container');
        if (!container && !pubContainer) return;

        try {
            let response = await fetch(url);
            let data;
            if (response.ok) {
                data = await response.json();
            } else {
                console.warn('Backend news API route returned non-200. Falling back to direct fetch.');
                const directUrl = `https://gnews.io/api/v4/search?q=${encodeURIComponent(query)}&lang=en&sortBy=publishedAt&apikey=${apiKey}`;
                response = await fetch(directUrl);
                data = await response.json();
            }
            
            if (data.articles) {
                window.newsFetched = true;
                if (container) container.innerHTML = '';
                if (pubContainer) pubContainer.innerHTML = '';
                
                if (data.articles.length === 0) {
                    const noNews = '<div style="padding:20px; color:var(--t3);">No news found.</div>';
                    if (container) container.innerHTML = noNews;
                    if (pubContainer) pubContainer.innerHTML = noNews;
                }
                
                let styleAdded = false;
                data.articles.forEach((article, index) => {
                    try {
                        const date = article.publishedAt ? new Date(article.publishedAt).toLocaleDateString(undefined, {month:'short', day:'numeric', year:'numeric'}) : 'Unknown date';
                        
                        if (!styleAdded) {
                            const style = document.createElement('style');
                            style.textContent = `
                                .news-card {
                                    display: flex;
                                    gap: 16px;
                                    padding: 16px;
                                    margin-bottom: 12px;
                                    background: rgba(255, 255, 255, 0.02);
                                    border: 1px solid rgba(255, 255, 255, 0.04);
                                    border-radius: 8px;
                                    transition: all 0.2s ease;
                                    text-decoration: none;
                                    color: inherit;
                                }
                                .news-card:hover {
                                    background: rgba(255, 255, 255, 0.05);
                                    border-color: rgba(0, 212, 170, 0.3);
                                    transform: translateY(-2px);
                                }
                                .news-num {
                                    flex-shrink: 0;
                                    width: 28px;
                                    height: 28px;
                                    display: flex;
                                    align-items: center;
                                    justify-content: center;
                                    background: rgba(0, 212, 170, 0.1);
                                    color: var(--teal, #00d4aa);
                                    border-radius: 50%;
                                    font-size: 13px;
                                    font-weight: 600;
                                    font-family: 'IBM Plex Mono', monospace;
                                }
                                .news-content {
                                    flex: 1;
                                    min-width: 0;
                                }
                                .news-title {
                                    color: var(--teal, #00d4aa);
                                    font-size: 15px;
                                    font-weight: 600;
                                    margin-bottom: 6px;
                                    line-height: 1.4;
                                    transition: color 0.2s;
                                }
                                .news-card:hover .news-title {
                                    color: #fff;
                                }
                                .news-desc {
                                    font-size: 13.5px;
                                    color: var(--t3, #a0aec0);
                                    margin-bottom: 10px;
                                    line-height: 1.5;
                                    display: -webkit-box;
                                    -webkit-line-clamp: 2;
                                    -webkit-box-orient: vertical;
                                    overflow: hidden;
                                }
                                .news-meta {
                                    display: flex;
                                    align-items: center;
                                    gap: 8px;
                                    font-size: 11.5px;
                                    color: var(--t4, #718096);
                                    text-transform: uppercase;
                                    letter-spacing: 0.5px;
                                    font-weight: 500;
                                }
                            `;
                            container.appendChild(style);
                            styleAdded = true;
                        }

                        const title = article.title || 'Untitled';
                        const link = article.url || '#';
                        const desc = article.description || 'No description available.';
                        const sourceName = (article.source && article.source.name) ? article.source.name : 'Unknown Source';

                        const item = document.createElement('a');
                        item.href = link;
                        item.target = '_blank';
                        item.className = 'news-card';
                        
                        item.innerHTML = `
                            <div class="news-num">${index + 1}</div>
                            <div class="news-content">
                                <div class="news-title">${title}</div>
                                <div class="news-desc">${desc}</div>
                                <div class="news-meta">
                                    <span>${sourceName}</span>
                                    <span style="opacity:0.5">•</span>
                                    <span>${date}</span>
                                </div>
                            </div>
                        `;
                        container.appendChild(item);
                    } catch (e) {
                        console.error('Error parsing article', e);
                    }
                });
            } else if (data.errors) {
                let errMsg = Array.isArray(data.errors) ? data.errors[0] : (typeof data.errors === 'string' ? data.errors : JSON.stringify(data.errors));
                container.innerHTML = `<div style="padding:20px; color:#ff4444;">Error: ${errMsg}</div>`;
            } else {
                container.innerHTML = `<div style="padding:20px; color:#ff4444;">API returned unexpected format. Check console.</div>`;
                console.warn('Unexpected API response:', data);
            }
        } catch (error) {
            console.error('Error fetching news:', error);
            container.innerHTML = '<div style="padding:20px; color:#ff4444;">Failed to load news.</div>';
        }
    }
    
    // Attempt to load news if we start on the policy panel
    document.addEventListener('DOMContentLoaded', () => {
        if (document.getElementById('panel-policy') && document.getElementById('panel-policy').style.display === 'block') {
            window.fetchCarbonNews();
        }
    });
