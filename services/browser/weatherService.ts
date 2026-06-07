/**
 * weatherService.ts — Clima via Open-Meteo (sem API key)
 * Geocodificação + previsão atual
 */

export interface WeatherResult {
  city: string;
  temperature: number;
  feelsLike: number;
  description: string;
  humidity: number;
  windSpeed: number;
  isDay: boolean;
  weatherCode: number;
  formatted: string; // String pronta para TTS
}

/** WMO Weather Code → descrição em português */
function weatherCodeToDescription(code: number, isDay: boolean): string {
  if (code === 0) return isDay ? 'céu limpo' : 'noite limpa';
  if (code <= 2) return 'parcialmente nublado';
  if (code === 3) return 'encoberto';
  if (code <= 49) return 'neblina ou névoa';
  if (code <= 59) return 'chuvisco';
  if (code <= 69) return 'chuva';
  if (code <= 79) return 'neve';
  if (code <= 82) return 'chuva forte';
  if (code <= 84) return 'granizo';
  if (code <= 94) return 'tempestade';
  return 'tempestade com granizo';
}

/** Busca coordenadas pelo nome da cidade via Open-Meteo Geocoding */
async function geocodeCity(
  cityName: string
): Promise<{ lat: number; lon: number; name: string } | null> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1&language=pt&format=json`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.results || data.results.length === 0) return null;
  const r = data.results[0];
  return { lat: r.latitude, lon: r.longitude, name: r.name };
}

/** Pega coordenadas via geolocation do browser */
function getBrowserLocation(): Promise<{ lat: number; lon: number } | null> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 5000 }
    );
  });
}

/** Busca dados de clima para lat/lon via Open-Meteo */
async function fetchWeatherByCoords(lat: number, lon: number): Promise<{
  temperature: number;
  feelsLike: number;
  humidity: number;
  windSpeed: number;
  weatherCode: number;
  isDay: boolean;
} | null> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day` +
    `&wind_speed_unit=kmh&temperature_unit=celsius&timezone=auto`;

  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const c = data.current;
  return {
    temperature: Math.round(c.temperature_2m),
    feelsLike: Math.round(c.apparent_temperature),
    humidity: c.relative_humidity_2m,
    windSpeed: Math.round(c.wind_speed_10m),
    weatherCode: c.weather_code,
    isDay: c.is_day === 1,
  };
}

/** Reverse geocoding simplificado: retorna nome da cidade mais próxima */
async function reverseGeocode(lat: number, lon: number): Promise<string> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=pt-BR`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Argos PWA/1.0' } });
    if (!res.ok) return 'sua localização';
    const data = await res.json();
    return (
      data.address?.city ||
      data.address?.town ||
      data.address?.village ||
      data.address?.municipality ||
      'sua localização'
    );
  } catch {
    return 'sua localização';
  }
}

/**
 * Função principal: busca clima para uma cidade ou localização atual
 * @param cityName - Nome da cidade (opcional; se omitido, usa geolocation)
 */
export async function getWeather(cityName?: string): Promise<WeatherResult> {
  let lat: number;
  let lon: number;
  let resolvedCity: string;

  if (cityName && cityName.trim()) {
    // Geocodifica o nome da cidade
    const geo = await geocodeCity(cityName.trim());
    if (!geo) {
      throw new Error(`Não encontrei a cidade "${cityName}". Tente outro nome.`);
    }
    lat = geo.lat;
    lon = geo.lon;
    resolvedCity = geo.name;
  } else {
    // Usa geolocation do browser
    const loc = await getBrowserLocation();
    if (!loc) {
      throw new Error(
        'Não consegui obter sua localização. Diga o nome da cidade, por exemplo: "clima em São Paulo".'
      );
    }
    lat = loc.lat;
    lon = loc.lon;
    resolvedCity = await reverseGeocode(lat, lon);
  }

  const weather = await fetchWeatherByCoords(lat, lon);
  if (!weather) {
    throw new Error('Não consegui obter dados de clima agora. Tente novamente.');
  }

  const description = weatherCodeToDescription(weather.weatherCode, weather.isDay);

  // Monta frase para TTS
  const formatted =
    `Em ${resolvedCity}: ${weather.temperature}°C, ${description}. ` +
    `Sensação térmica de ${weather.feelsLike}°C, umidade de ${weather.humidity}% ` +
    `e vento a ${weather.windSpeed} km/h.`;

  return {
    city: resolvedCity,
    temperature: weather.temperature,
    feelsLike: weather.feelsLike,
    description,
    humidity: weather.humidity,
    windSpeed: weather.windSpeed,
    isDay: weather.isDay,
    weatherCode: weather.weatherCode,
    formatted,
  };
}
