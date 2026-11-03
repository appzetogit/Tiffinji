import mongoose from 'mongoose';
import { FoodUser } from '../../../../core/users/user.model.js';
import { ValidationError } from '../../../../core/auth/errors.js';

const CITY_COORDINATES_MAP = {
    dipka: { latitude: 22.3524, longitude: 82.5548 },
    korba: { latitude: 22.3524, longitude: 82.5548 },
    gevra: { latitude: 22.3524, longitude: 82.5548 },
    satna: { latitude: 24.5710, longitude: 80.8320 },
    'panna naka': { latitude: 24.5710, longitude: 80.8320 },
    rewa: { latitude: 24.5373, longitude: 81.3009 },
    bhilai: { latitude: 21.1900, longitude: 81.3800 },
    durg: { latitude: 21.1900, longitude: 81.3800 },
    bhopal: { latitude: 23.2599, longitude: 77.4126 },
    jabalpur: { latitude: 23.1815, longitude: 79.9864 },
    'tilda newra': { latitude: 21.5260, longitude: 81.7720 },
    tilda: { latitude: 21.5260, longitude: 81.7720 },
    newra: { latitude: 21.5260, longitude: 81.7720 },
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

const toGeoPoint = (dto) => {
    let lat = Number(dto?.latitude);
    let lng = Number(dto?.longitude);
    const text = String(dto?.city || dto?.street || dto?.additionalDetails || '').toLowerCase();

    for (const [cityName, targetCoords] of Object.entries(CITY_COORDINATES_MAP)) {
        if (text.includes(cityName)) {
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
                lat = targetCoords.latitude;
                lng = targetCoords.longitude;
                break;
            }
            const dist = calculateDistanceInKm(lat, lng, targetCoords.latitude, targetCoords.longitude);
            if (dist > 50) {
                lat = targetCoords.latitude;
                lng = targetCoords.longitude;
                break;
            }
        }
    }

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
    return { type: 'Point', coordinates: [lng, lat] };
};

const normalizeLabel = (label) => {
    const v = String(label || '').trim();
    if (v === 'Work') return 'Office';
    if (v === 'home' || v === 'Home') return 'Home';
    if (v === 'office' || v === 'Office') return 'Office';
    if (v === 'other' || v === 'Other') return 'Other';
    return 'Other';
};

export const listAddresses = async (userId) => {
    const user = await FoodUser.findById(userId).select('addresses').lean();
    return { addresses: user?.addresses || [] };
};

export const addAddress = async (userId, dto) => {
    const user = await FoodUser.findById(userId).select('addresses');
    if (!user) throw new ValidationError('User not found');

    const address = {
        label: normalizeLabel(dto.label),
        street: dto.street,
        additionalDetails: dto.additionalDetails || '',
        city: dto.city,
        state: dto.state,
        zipCode: dto.zipCode || '',
        phone: dto.phone || '',
        location: toGeoPoint(dto),
        isDefault: false
    };

    // If same label exists, update-in-place (keeps "Home/Office/Other" single entry best UX)
    const existingIdx = user.addresses.findIndex((a) => String(a?.label) === String(address.label));
    if (existingIdx >= 0) {
        const existing = user.addresses[existingIdx];
        existing.label = address.label;
        existing.street = address.street;
        existing.additionalDetails = address.additionalDetails;
        existing.city = address.city;
        existing.state = address.state;
        existing.zipCode = address.zipCode;
        existing.phone = address.phone;
        if (address.location) existing.location = address.location;
        await user.save();
        return { address: existing.toObject() };
    }

    // First address becomes default automatically
    if (!user.addresses.some((a) => a.isDefault)) {
        address.isDefault = true;
    }

    user.addresses.push(address);
    await user.save();
    const saved = user.addresses[user.addresses.length - 1];
    return { address: saved.toObject() };
};

export const updateAddress = async (userId, addressId, dto) => {
    if (!mongoose.Types.ObjectId.isValid(addressId)) {
        throw new ValidationError('Invalid address id');
    }
    const user = await FoodUser.findById(userId).select('addresses');
    if (!user) throw new ValidationError('User not found');

    const address = user.addresses.id(addressId);
    if (!address) throw new ValidationError('Address not found');

    if (dto.label !== undefined) address.label = normalizeLabel(dto.label);
    if (dto.street !== undefined) address.street = dto.street;
    if (dto.additionalDetails !== undefined) address.additionalDetails = dto.additionalDetails || '';
    if (dto.city !== undefined) address.city = dto.city;
    if (dto.state !== undefined) address.state = dto.state;
    if (dto.zipCode !== undefined) address.zipCode = dto.zipCode || '';
    if (dto.phone !== undefined) address.phone = dto.phone || '';
    const location = toGeoPoint(dto);
    if (location) address.location = location;

    await user.save();
    return { address: address.toObject() };
};

export const deleteAddress = async (userId, addressId) => {
    if (!mongoose.Types.ObjectId.isValid(addressId)) {
        throw new ValidationError('Invalid address id');
    }
    const user = await FoodUser.findById(userId).select('addresses');
    if (!user) throw new ValidationError('User not found');

    const address = user.addresses.id(addressId);
    if (!address) throw new ValidationError('Address not found');

    const wasDefault = !!address.isDefault;
    address.deleteOne();

    // If deleting default, promote the newest remaining address to default
    if (wasDefault) {
        const remaining = user.addresses.filter(Boolean);
        if (remaining.length) {
            remaining.forEach((a) => {
                a.isDefault = false;
            });
            remaining[remaining.length - 1].isDefault = true;
        }
    }

    await user.save();
    return { success: true };
};

export const setDefaultAddress = async (userId, addressId) => {
    if (!mongoose.Types.ObjectId.isValid(addressId)) {
        throw new ValidationError('Invalid address id');
    }
    const user = await FoodUser.findById(userId).select('addresses');
    if (!user) throw new ValidationError('User not found');

    const address = user.addresses.id(addressId);
    if (!address) throw new ValidationError('Address not found');

    user.addresses.forEach((a) => {
        a.isDefault = String(a._id) === String(addressId);
    });
    await user.save();

    const updated = user.addresses.id(addressId);
    return { address: updated?.toObject() };
};

