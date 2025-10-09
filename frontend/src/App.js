import React, { useRef, useEffect, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

mapboxgl.accessToken = 'pk.eyJ1IjoidmlkaGlyYXdhdDEwIiwiYSI6ImNtZnBrb3NudzBoOGQyaXM4cTdsdWV0cjIifQ.bfa7HH6enfhJhYCbaofDwg';

// Dedicated component to handle ALL map logic
function MapContainer({ forecastData }) {
    const mapContainerRef = useRef(null);
    const mapRef = useRef(null);

    // This useEffect runs only ONCE to initialize the map
    useEffect(() => {
        if (mapRef.current) return;
        
        const map = new mapboxgl.Map({
            container: mapContainerRef.current,
            style: 'mapbox://styles/mapbox/dark-v11',
            center: [77.1025, 28.7041],
            zoom: 9
        });
        mapRef.current = map;

        map.on('load', () => {
            // Add the source with empty initial data
            map.addSource('forecast-points', {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] }
            });

            // Add the layer that will display the points
            map.addLayer({
                id: 'point-layer',
                type: 'circle',
                source: 'forecast-points',
                paint: {
                    'circle-radius': 10,
                    'circle-color': ['get', 'color'],
                    'circle-opacity': 0.8,
                    'circle-stroke-width': 1,
                    'circle-stroke-color': '#fff'
                }
            });
        });

        return () => map.remove();
    }, []);

    // This useEffect runs whenever the forecastData prop changes
    useEffect(() => {
        if (!mapRef.current || !forecastData) return;
        
        const map = mapRef.current;

        // THIS IS THE FIX: This function updates the map data
        const updateMapData = () => {
            const source = map.getSource('forecast-points');
            if (source) {
                source.setData(forecastData);
            }
        };

        // Check if the map is fully loaded. If it is, update the data.
        // If not, wait for the 'idle' event (which fires after everything is loaded)
        // and then update the data.
        if (map.isStyleLoaded()) {
            updateMapData();
        } else {
            map.once('idle', updateMapData);
        }
    }, [forecastData]);

    return (
        <div 
            ref={mapContainerRef} 
            style={{ height: '80vh', width: '100%', marginTop: '20px' }} 
        />
    );
}

// Main App component that handles fetching the data
function App() {
    const [forecastData, setForecastData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const getColorForPM25 = (value) => {
        if (value < 50) return '#00E400';
        if (value < 100) return '#FFFF00';
        if (value < 150) return '#FF7E00';
        if (value < 200) return '#FF0000';
        if (value < 300) return '#8F3F97';
        return '#7E0023';
    };

    const handleForecast = async () => {
        setLoading(true);
        setError('');
        try {
            const today = new Date();
            const endDate = new Date();
            endDate.setDate(today.getDate() + 5);

            const response = await fetch('http://localhost:8000/api/v1/forecast', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    start_date: today.toISOString().split('T')[0],
                    end_date: endDate.toISOString().split('T')[0],
                }),
            });
            if (!response.ok) throw new Error('Network response was not ok');
            
            const data = await response.json();
            
            const geojsonData = {
                type: 'FeatureCollection',
                features: data.forecast.map(point => ({
                    type: 'Feature',
                    geometry: { type: 'Point', coordinates: [point.lon, point.lat] },
                    properties: {
                        pm25: point.predicted_pm25,
                        timestamp: point.timestamp,
                        color: getColorForPM25(point.predicted_pm25)
                    }
                }))
            };
            setForecastData(geojsonData);
        } catch (err) {
            setError('Failed to fetch forecast. Is the backend server running?');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ fontFamily: 'sans-serif', textAlign: 'center' }}>
            <h1>Urban CO₂ Digital Twin (PM2.5 Forecast)</h1>
            <button onClick={handleForecast} disabled={loading}>
                {loading ? 'Forecasting...' : 'Get 5-Day Forecast for Delhi'}
            </button>
            {error && <p style={{ color: 'red' }}>{error}</p>}
            <MapContainer forecastData={forecastData} />
        </div>
    );
}

export default App;
