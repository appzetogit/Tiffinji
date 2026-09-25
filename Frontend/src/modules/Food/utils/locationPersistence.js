/** Single writer for location-related localStorage keys. */

const CITY_COORDINATES_MAP = {
  rewa: { latitude: 24.5373, longitude: 81.3009 },
  satna: { latitude: 24.5710, longitude: 80.8320 },
  bhilai: { latitude: 21.1900, longitude: 81.3800 },
  bhopal: { latitude: 23.2599, longitude: 77.4126 },
  jabalpur: { latitude: 23.1815, longitude: 79.9864 },
  indore: { latitude: 22.7196, longitude: 75.8577 },
};

function calculateDistanceInKm(lat1, lng1, lat2, lng2) {
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
  if (!location || typeof location.latitude !== 'number' || typeof location.longitude !== 'number') {
    return location;
  }
  const cityStr = String(location.city || location.address || location.formattedAddress || '').toLowerCase();
  for (const [cityName, targetCoords] of Object.entries(CITY_COORDINATES_MAP)) {
    if (cityStr.includes(cityName)) {
      const dist = calculateDistanceInKm(location.latitude, location.longitude, targetCoords.latitude, targetCoords.longitude);
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
    if (parsed && typeof parsed.latitude === 'number' && typeof parsed.longitude === 'number') {
      const sanitized = sanitizeLocationCoords(parsed);
      if (sanitized.latitude !== parsed.latitude || sanitized.longitude !== parsed.longitude) {
        parsed = sanitized;
        localStorage.setItem('userLocation', JSON.stringify(parsed));
        localStorage.setItem('userLat', String(parsed.latitude));
        localStorage.setItem('userLng', String(parsed.longitude));
      }
      return parsed;
    }
  } catch (_) {}
  return null;
}

export function persistUserLocation(location, { mode } = {}) {
  if (!location?.latitude || !location?.longitude) return;
  const sanitized = sanitizeLocationCoords(location);
  try {
    localStorage.setItem('userLocation', JSON.stringify(sanitized));
    localStorage.setItem('userLat', String(sanitized.latitude));
    localStorage.setItem('userLng', String(sanitized.longitude));
    if (mode === 'saved' || mode === 'current') {
      localStorage.setItem('deliveryAddressMode', mode);
    }
  } catch (_) {}
}

export function clearStoredUserLocation() {
  try {
    localStorage.removeItem('userLocation');
    localStorage.removeItem('userLat');
    localStorage.removeItem('userLng');
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
