import os
import json
import datetime
import pandas as pd
import yfinance as yf
from prophet import Prophet
from sklearn.metrics import mean_absolute_percentage_error
import numpy as np

# Define tickers in use by the platform
TICKERS = ['CO2.MI', 'KCCA', '3060.HK']

results = {}

for ticker in TICKERS:
    print(f"Downloading history for {ticker}...")
    # Download 3 years of daily historical data
    end_date = datetime.date.today()
    start_date = end_date - datetime.timedelta(days=3*365)
    
    df = yf.download(ticker, start=start_date, end=end_date, progress=False)
    
    if df.empty or len(df) < 50:
        print(f"Warning: Not enough data found for {ticker}. Skipping.")
        continue

    # Prepare DataFrame for Prophet (columns 'ds' and 'y')
    df = df.reset_index()
    # Handle yfinance multi-index columns if present
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = [col[0] for col in df.columns]
        
    df_prophet = pd.DataFrame({
        'ds': pd.to_datetime(df['Date']).dt.tz_localize(None),
        'y': df['Close']
    }).dropna()

    if len(df_prophet) < 50:
        print(f"Warning: Not enough valid rows for {ticker}. Skipping.")
        continue

    # Chronological Split (80% Train, 20% Test)
    split_idx = int(len(df_prophet) * 0.8)
    train_df = df_prophet.iloc[:split_idx]
    test_df = df_prophet.iloc[split_idx:]

    print(f"  Training validation model (80% train, size={len(train_df)})...")
    # Validation step
    val_model = Prophet(
        daily_seasonality=False,
        weekly_seasonality=True,
        yearly_seasonality=True
    )
    val_model.fit(train_df)
    
    # Predict on test timeline
    future_val = val_model.make_future_dataframe(periods=len(test_df), include_history=False)
    # Align dates
    future_val['ds'] = test_df['ds'].values
    forecast_val = val_model.predict(future_val)
    
    y_true = test_df['y'].values
    y_pred = forecast_val['yhat'].values
    
    # Calculate Mean Absolute Percentage Error (MAPE)
    test_mape = float(mean_absolute_percentage_error(y_true, y_pred) * 100)
    print(f"  Validation MAPE: {test_mape:.2f}%")

    print("  Training full model (100% data)...")
    # Full retrain on all historical data up to today
    full_model = Prophet(
        daily_seasonality=False,
        weekly_seasonality=True,
        yearly_seasonality=True
    )
    full_model.fit(df_prophet)

    # 15-Day Future Forecast starting tomorrow
    future_days = full_model.make_future_dataframe(periods=15, include_history=False)
    # Generate dates starting from tomorrow
    last_date = df_prophet['ds'].max()
    future_dates = [last_date + datetime.timedelta(days=i) for i in range(1, 16)]
    future_days['ds'] = future_dates
    
    forecast_days = full_model.predict(future_days)

    # Format predictions list
    predictions_list = []
    for _, row in forecast_days.iterrows():
        predictions_list.append({
            "date": row['ds'].strftime('%Y-%m-%d'),
            "price": round(float(row['yhat']), 2)
        })

    results[ticker] = {
        "test_mape": round(test_mape, 2),
        "predictions": predictions_list
    }

# Save output to predictions.json in root folder
output_path = 'predictions.json'
with open(output_path, 'w', encoding='utf-8') as f:
    json.dump(results, f, indent=2)

print(f"Successfully saved all predictions to {output_path}!")
