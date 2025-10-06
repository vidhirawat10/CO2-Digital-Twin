# backend/app/main.py

import pandas as pd
import requests
import joblib
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import date

# --- 1. SETUP ---
# Create the FastAPI app
app = FastAPI(title="PM2.5 Forecasting API")

# Allow communication from our frontend (running on localhost:3000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load the trained model and required assets
try:
    model = joblib.load('models/rf_model_v2.joblib')
    model_columns = joblib.load('models/model_v2_columns.joblib')
    last_known_pm25 = joblib.load('models/last_known_pm25.joblib')
    print("✅ Model and assets loaded successfully.")
except FileNotFoundError:
    print("🚨 ERROR: Model files not found. Make sure they are in the /models folder.")
    model = None # Set model to None if loading fails

# Define the input data model for the API request
class ForecastRequest(BaseModel):
    start_date: date
    end_date: date

# --- 2. FORECASTING LOGIC ---
def get_forecast(start_date: str, end_date: str):
    if not model:
        return {"error": "Model not loaded."}

    # Fetch future weather data from Open-Meteo
    weather_url = f"https://api.open-meteo.com/v1/forecast?latitude=28.7041&longitude=77.1025&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m&start_date={start_date}&end_date={end_date}"
    response = requests.get(weather_url)
    weather_json = response.json()
    df_future_weather = pd.DataFrame.from_dict(weather_json['hourly'])
    
    # Prepare the weather DataFrame
    df_future_weather = df_future_weather.rename(columns={
        'time': 'timestamp', 'temperature_2m': 'temperature_c',
        'relative_humidity_2m': 'humidity_percent', 'wind_speed_10m': 'wind_speed_kmh',
        'wind_direction_10m': 'wind_direction_deg'
    })
    df_future_weather['timestamp'] = pd.to_datetime(df_future_weather['timestamp'])
    df_future_weather = df_future_weather.set_index('timestamp')

    # Start the autoregressive forecast
    pm25_lag1, pm25_lag2 = list(last_known_pm25.values())
    predictions = []

    for timestamp, weather_row in df_future_weather.iterrows():
        assert isinstance(timestamp, pd.Timestamp) # Add this line to help the linter
        # Create time-based features
        hour = timestamp.hour
        day_of_week = timestamp.dayofweek
        day_of_year = timestamp.dayofyear
        
        # Assemble the feature vector in the correct order
        current_features = {
            'temperature_c': weather_row['temperature_c'],
            'humidity_percent': weather_row['humidity_percent'],
            'wind_speed_kmh': weather_row['wind_speed_kmh'],
            'wind_direction_deg': weather_row['wind_direction_deg'],
            'pm25_lag1': pm25_lag1, 'pm25_lag2': pm25_lag2,
            'hour': hour, 'day_of_week': day_of_week, 'day_of_year': day_of_year
        }
        current_features_df = pd.DataFrame([current_features], columns=model_columns)
        
        # Predict and update lags
        current_prediction = model.predict(current_features_df)[0]
        predictions.append({
            "timestamp": timestamp.isoformat(),
            "predicted_pm25": round(current_prediction, 2),
            "lat": 28.7041, # Delhi coordinates
            "lon": 77.1025
        })
        pm25_lag2, pm25_lag1 = pm25_lag1, current_prediction
        
    return predictions

# --- 3. API ENDPOINT ---
@app.post("/api/v1/forecast")
def forecast(request: ForecastRequest):
    """Receives start and end dates, returns PM2.5 forecast."""
    predictions = get_forecast(request.start_date.isoformat(), request.end_date.isoformat())
    return {"forecast": predictions}

@app.get("/")
def read_root():
    return {"message": "Welcome to the PM2.5 Forecasting API"}