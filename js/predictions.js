// ─── AI PREDICTIONS FORECAST LOGIC ───

let predictionsDataCache = null;

    async function updateAIPredictions(symbol) {
        const tableBody = document.querySelector('#predTable tbody');
        const forecastContainer = document.getElementById('aiForecastChart');
        if (!forecastContainer || !tableBody) return;

        // Ensure canvas exists
        let canvas = document.getElementById('aiChartCanvas');
        if (!canvas) {
            forecastContainer.innerHTML = '<canvas id="aiChartCanvas" style="width:100%; height:220px;"></canvas>';
            canvas = document.getElementById('aiChartCanvas');
        }

        // Fetch predictions.json if not cached
        if (!predictionsDataCache) {
            try {
                // Try relative path first
                const res = await fetch('predictions.json');
                if (!res.ok) throw new Error('Local predictions.json not found');
                predictionsDataCache = await res.json();
            } catch (err) {
                console.warn('Failed to fetch local predictions.json, falling back to GitHub raw URL:', err);
                try {
                    const fallbackUrl = 'https://raw.githubusercontent.com/garlapatisai/ss/main/predictions.json';
                    const res = await fetch(fallbackUrl);
                    predictionsDataCache = await res.json();
                } catch (fallbackErr) {
                    console.error('Failed to fetch fallback predictions:', fallbackErr);
                    forecastContainer.innerHTML = '<div style="color:var(--crimson); text-align:center; padding-top:60px; font-size:13px; font-family:var(--mono);">Failed to load daily forecast predictions.json</div>';
                    return;
                }
            }
        }

        const data = predictionsDataCache[symbol];
        if (!data || !data.predictions || data.predictions.length === 0) {
            forecastContainer.innerHTML = '<div style="color:var(--t3); text-align:center; padding-top:60px; font-size:13px; font-family:var(--mono);">No forecast predictions available for this asset.</div>';
            return;
        }

        // 1. Update Accuracy Card
        const accuracy = 100 - data.test_mape;
        const accuracyCard = document.querySelector('#panel-ai .card:nth-of-type(3)');
        if (accuracyCard) {
            const pctVal = accuracyCard.querySelector('div[style*="font-size:32px"]');
            if (pctVal) pctVal.textContent = accuracy.toFixed(1) + '%';
            const mapeVal = accuracyCard.querySelector('div[style*="font-size:11px"]:nth-of-type(2)');
            if (mapeVal) {
                mapeVal.innerHTML = `MAPE (Val): <strong style="color:var(--gold)">${data.test_mape.toFixed(2)}%</strong> &nbsp;·&nbsp; Model: <strong style="color:var(--gold)">Prophet</strong>`;
            }
        }

        // 2. Populate Predictions Table & Signal Indicators
        tableBody.innerHTML = '';
        const currentPrice = window.holdingsPrices[symbol] || data.predictions[0].price;
        
        let prevPrice = currentPrice;
        let priceDiffTotal = 0;

        data.predictions.forEach((pred, index) => {
            const changeVal = pred.price - prevPrice;
            const changePct = prevPrice ? (changeVal / prevPrice) * 100 : 0;
            prevPrice = pred.price;
            priceDiffTotal += changeVal;

            const tone = changeVal >= 0 ? 'pos' : 'neg';
            const sign = changeVal >= 0 ? '+' : '';
            const signText = changeVal >= 0 ? '▲' : '▼';
            
            // Simulating a decay of confidence over forecast horizon
            const confDecay = Math.max(70, Math.round(accuracy - (index * 1.5)));

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-family:var(--mono);">${pred.date}</td>
                <td style="font-family:var(--mono); font-weight:700; color:var(--t1);">${pred.price.toFixed(2)}</td>
                <td class="${tone}" style="font-family:var(--mono); font-weight:600;">${signText} ${sign}${changeVal.toFixed(2)} (${sign}${changePct.toFixed(1)}%)</td>
                <td style="font-family:var(--mono); text-align:right;">${confDecay}%</td>
            `;
            tableBody.appendChild(tr);
        });

        // 3. Update Model Signal Summary Indicators based on forecast trend
        const firstPrice = data.predictions[0].price;
        const lastPrice = data.predictions[data.predictions.length - 1].price;
        const netChange = lastPrice - firstPrice;
        
        const trendVal = document.getElementById('aiTrendVal');
        const trendFill = document.getElementById('aiTrendFill');
        if (trendVal && trendFill) {
            if (netChange > 0.05) {
                trendVal.textContent = 'Bullish';
                trendVal.className = 'acc-num pos';
                trendFill.className = 'acc-fill acc-g';
                trendFill.style.width = '82%';
            } else if (netChange < -0.05) {
                trendVal.textContent = 'Bearish';
                trendVal.className = 'acc-num neg';
                trendFill.className = 'acc-fill acc-r';
                trendFill.style.width = '78%';
            } else {
                trendVal.textContent = 'Consolidating';
                trendVal.className = 'acc-num neu';
                trendFill.className = 'acc-fill acc-a';
                trendFill.style.width = '55%';
            }
        }

        // Set simulated volatility based on ticker volatility characteristics
        const volVal = document.getElementById('aiVolVal');
        const volFill = document.getElementById('aiVolFill');
        if (volVal && volFill) {
            if (symbol === 'CO2.MI') {
                volVal.textContent = 'High';
                volVal.className = 'acc-num neg';
                volFill.style.width = '75%';
                volFill.className = 'acc-fill acc-r';
            } else if (symbol === 'KCCA') {
                volVal.textContent = 'Moderate';
                volVal.className = 'acc-num neu';
                volFill.style.width = '45%';
                volFill.className = 'acc-fill acc-a';
            } else {
                volVal.textContent = 'Low';
                volVal.className = 'acc-num pos';
                volFill.style.width = '20%';
                volFill.className = 'acc-fill acc-g';
            }
        }

        // 4. Render Chart.js Forecast Graph
        const labels = data.predictions.map(p => p.date);
        const prices = data.predictions.map(p => p.price);

        if (window.aiChartInstance) {
            window.aiChartInstance.destroy();
        }

        const ctx = canvas.getContext('2d');
        const isLight = document.documentElement.classList.contains('light-mode');
        const gridColor = isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)';
        const labelColor = isLight ? '#64748B' : '#6D8Baa';
        const strokeColor = netChange >= 0 ? '#00d4aa' : '#ff4a5a';
        
        // Gradient fill
        const gradient = ctx.createLinearGradient(0, 0, 0, 200);
        if (netChange >= 0) {
            gradient.addColorStop(0, 'rgba(0, 212, 170, 0.25)');
            gradient.addColorStop(1, 'rgba(0, 212, 170, 0.0)');
        } else {
            gradient.addColorStop(0, 'rgba(255, 74, 90, 0.25)');
            gradient.addColorStop(1, 'rgba(255, 74, 90, 0.0)');
        }

        window.aiChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Prophet Forecast Price',
                    data: prices,
                    borderColor: strokeColor,
                    borderWidth: 2,
                    pointBackgroundColor: strokeColor,
                    pointBorderColor: strokeColor,
                    pointRadius: 3,
                    pointHoverRadius: 6,
                    fill: true,
                    backgroundColor: gradient,
                    tension: 0.2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: {
                        grid: { color: gridColor },
                        ticks: { color: labelColor, font: { family: 'var(--mono)', size: 9 } }
                    },
                    y: {
                        grid: { color: gridColor },
                        ticks: { color: labelColor, font: { family: 'var(--mono)', size: 9 } }
                    }
                }
            }
        });
    }
