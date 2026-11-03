/** Single writer for location-related localStorage keys. */

export const CITY_COORDINATES_MAP = {
  dipka: { latitude: 22.3524, longitude: 82.5548, zoneId: '6a6dd9765cc8ef6a2689399f', zoneName: 'Dipka' },
  korba: { latitude: 22.3524, longitude: 82.5548, zoneId: '6a6dd9765cc8ef6a2689399f', zoneName: 'Dipka' },
  gevra: { latitude: 22.3524, longitude: 82.5548, zoneId: '6a6dd9765cc8ef6a2689399f', zoneName: 'Dipka' },
  satna: { latitude: 24.5710, longitude: 80.8320, zoneId: '6a6dd7745cc8ef6a2689391c', zoneName: 'Satna' },
  'panna naka': { latitude: 24.5710, longitude: 80.8320, zoneId: '6a6dd7745cc8ef6a2689391c', zoneName: 'Satna' },
  rewa: { latitude: 24.5373, longitude: 81.3009, zoneId: '6a762e654b893bcccf0d07e7', zoneName: 'Rewa' },
  bhilai: { latitude: 21.1900, longitude: 81.3800, zoneId: '6a6dd9365cc8ef6a26893989', zoneName: 'Bhilai' },
  durg: { latitude: 21.1900, longitude: 81.3800, zoneId: '6a6dd9365cc8ef6a26893989', zoneName: 'Bhilai' },
  bhopal: { latitude: 23.2599, longitude: 77.4126, zoneId: '69cd1d83dea705256a43e70d', zoneName: 'bhopal' },
  jabalpur: { latitude: 23.1815, longitude: 79.9864, zoneId: '6a6dd7d45cc8ef6a2689392b', zoneName: 'Jabalpur' },
  'tilda newra': { latitude: 21.5260, longitude: 81.7720, zoneId: '6a6dda235cc8ef6a268939a8', zoneName: 'Tilda Newra' },
  tilda: { latitude: 21.5260, longitude: 81.7720, zoneId: '6a6dda235cc8ef6a268939a8', zoneName: 'Tilda Newra' },
  newra: { latitude: 21.5260, longitude: 81.7720, zoneId: '6a6dda235cc8ef6a268939a8', zoneName: 'Tilda Newra' },
  indore: { latitude: 22.7196, longitude: 75.8577, zoneId: '69b85a63fb04545984776cdb', zoneName: 'Indore' },
};

export function calculateDistanceInKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function sanitizeLocationCoords(location) {
  if (!location) return location;
  const cityStr = String(location.city || location.address || location.formattedAddress || location.street || '').toLowerCase();
  
  for (const [cityName, targetCoords] of Object.entries(CITY_COORDINATES_MAP)) {
    if (cityStr.includes(cityName)) {
      const currentLat = Number(location.latitude);
      const currentLng = Number(location.longitude);
      
      if (!Number.isFinite(currentLat) || !Number.isFinite(currentLng)) {
        return {
          ...location,
          latitude: targetCoords.latitude,
          longitude: targetCoords.longitude,
        };
      }
      
      const dist = calculateDistanceInKm(currentLat, currentLng, targetCoords.latitude, targetCoords.longitude);
      if (dist > 50) {
        return {
          ...location,
          latitude: targetCoords.latitude,
          longitude: targetCoords.longitude,
        };
      }
    }
  }
  return location;
}

export function readStoredUserLocation() {
  try {
    const raw = localStorage.getItem('userLocation');
    if (!raw) return null;
    let parsed = JSON.parse(raw);
    if (parsed) {
      const sanitized = sanitizeLocationCoords(parsed);
      if (sanitized && Number.isFinite(Number(sanitized.latitude)) && Number.isFinite(Number(sanitized.longitude))) {
        if (sanitized.latitude !== parsed.latitude || sanitized.longitude !== parsed.longitude) {
          parsed = sanitized;
          localStorage.setItem('userLocation', JSON.stringify(parsed));
          localStorage.setItem('userLat', String(parsed.latitude));
          localStorage.setItem('userLng', String(parsed.longitude));
        }
        return parsed;
      }
    }
  } catch (_) {}
  return null;
}

export function persistUserLocation(location, { mode } = {}) {
  if (!location) return;
  const sanitized = sanitizeLocationCoords(location);
  if (!sanitized || !Number.isFinite(Number(sanitized.latitude)) || !Number.isFinite(Number(sanitized.longitude))) {
    return;
  }
  try {
    localStorage.setItem('userLocation', JSON.stringify(sanitized));
    localStorage.setItem('userLat', String(sanitized.latitude));
    localStorage.setItem('userLng', String(sanitized.longitude));
    if (mode === 'saved' || mode === 'current') {
      localStorage.setItem('deliveryAddressMode', mode);
    }
    
    // Proactively match known zone if userZoneId is missing
    const cityStr = String(sanitized.city || sanitized.address || sanitized.formattedAddress || sanitized.street || '').toLowerCase();
    for (const [cityName, targetCoords] of Object.entries(CITY_COORDINATES_MAP)) {
      if (cityStr.includes(cityName) && targetCoords.zoneId) {
        const dist = calculateDistanceInKm(sanitized.latitude, sanitized.longitude, targetCoords.latitude, targetCoords.longitude);
        if (dist <= 50) {
          localStorage.setItem('userZoneId', targetCoords.zoneId);
          localStorage.setItem('userZone', JSON.stringify({ _id: targetCoords.zoneId, name: targetCoords.zoneName }));
          localStorage.removeItem('outOfService');
          break;
        }
      }
    }
  } catch (_) {}
}

export function clearStoredUserLocation() {
  try {
    localStorage.removeItem('userLocation');
    localStorage.removeItem('userLat');
    localStorage.removeItem('userLng');
    localStorage.removeItem('userZoneId');
    localStorage.removeItem('userZone');
  } catch (_) {}
}

export function readDeliveryAddressMode() {
  try {
    return localStorage.getItem('deliveryAddressMode') || 'saved';
  } catch (_) {
    return 'saved';
  }
}

export function notifyLocationUpdated(location) {
  if (!location) return;
  window.dispatchEvent(new CustomEvent('userLocationUpdated', { detail: { location } }));
}

export function notifyDeliveryModeUpdated(mode) {
  window.dispatchEvent(new CustomEvent('deliveryAddressModeUpdated', { detail: { mode } }));
}
