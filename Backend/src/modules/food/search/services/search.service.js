import { FoodRestaurant } from '../../restaurant/models/restaurant.model.js';
import { FoodItem } from '../../admin/models/food.model.js';
import { FoodCategory } from '../../admin/models/category.model.js';
import mongoose from 'mongoose';

/**
 * Unified Search Service
 * Searches for restaurants by name and also searches for food items, 
 * returning matched restaurants with potential dish highlights.
 */
export const searchUnified = async (query = {}, options = {}) => {
    const { 
        q, 
        lat, 
        lng, 
        radiusKm = 20, 
        categoryId, 
        minRating, 
        maxDeliveryTime, 
        isVeg,
        page = 1,
        limit = 20,
        zoneId
    } = query;

    const skip = (page - 1) * limit;
    const term = String(q || '').trim();
    const regex = term ? new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null;

    // 1. Initial Filter (approved status and basic conditions)
    const restaurantFilter = { status: 'approved' };
    
    console.log(`[Search-Service] Querying with term: "${term}", categoryId: "${categoryId}", zoneId: "${zoneId}", lat: "${lat}", lng: "${lng}"`);

    let effectiveZoneId = String(zoneId || '').trim();

    // Auto-detect zoneId from lat/lng if not explicitly passed
    if (!effectiveZoneId && lat && lng) {
        const nLat = Number(lat);
        const nLng = Number(lng);
        if (Number.isFinite(nLat) && Number.isFinite(nLng)) {
            try {
                const { FoodZone } = await import('../../admin/models/zone.model.js');
                const zones = await FoodZone.find({ isActive: true }).lean();
                for (const z of zones) {
                    if (Array.isArray(z.coordinates) && z.coordinates.length >= 3) {
                        const poly = z.coordinates.map(c => [Number(c.longitude), Number(c.latitude)]);
                        if (poly[0][0] !== poly[poly.length - 1][0] || poly[0][1] !== poly[poly.length - 1][1]) {
                            poly.push(poly[0]);
                        }
                        // Ray-casting algorithm for point-in-polygon check
                        let inside = false;
                        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
                            const xi = poly[i][0], yi = poly[i][1];
                            const xj = poly[j][0], yj = poly[j][1];
                            const intersect = ((yi > nLat) !== (yj > nLat))
                                && (nLng < (xj - xi) * (nLat - yi) / (yj - yi) + xi);
                            if (intersect) inside = !inside;
                        }
                        if (inside) {
                            effectiveZoneId = String(z._id);
                            console.log(`[Search-Service] Auto-detected zoneId "${effectiveZoneId}" (${z.name}) from coordinates [${nLat}, ${nLng}]`);
                            break;
                        }
                    }
                }
            } catch (err) {
                console.error('[Search-Service] Error auto-detecting zone from coords:', err);
            }
        }
    }

    if (effectiveZoneId && mongoose.Types.ObjectId.isValid(effectiveZoneId)) {
        const zoneOr = [
            { zoneId: new mongoose.Types.ObjectId(effectiveZoneId) },
            { zoneId: String(effectiveZoneId) }
        ];
        try {
            const { FoodZone } = await import('../../admin/models/zone.model.js');
            const zoneDoc = await FoodZone.findOne({ _id: effectiveZoneId, isActive: true }).lean();
            if (zoneDoc && Array.isArray(zoneDoc.coordinates) && zoneDoc.coordinates.length >= 3) {
                const polygonCoords = zoneDoc.coordinates.map(c => [Number(c.longitude), Number(c.latitude)]);
                if (polygonCoords[0][0] !== polygonCoords[polygonCoords.length - 1][0] ||
                    polygonCoords[0][1] !== polygonCoords[polygonCoords.length - 1][1]) {
                    polygonCoords.push(polygonCoords[0]);
                }
                zoneOr.push({
                    location: {
                        $geoWithin: {
                            $geometry: {
                                type: 'Polygon',
                                coordinates: [polygonCoords]
                            }
                        }
                    }
                });
            }
        } catch (e) {
            // Ignore polygon resolution failures
        }
        restaurantFilter.$and = [...(restaurantFilter.$and || []), { $or: zoneOr }];
    }

    if (isVeg === 'true') {
        restaurantFilter.pureVegRestaurant = true;
    }

    if (minRating) {
        restaurantFilter.rating = { $gte: parseFloat(minRating) };
    }

    if (maxDeliveryTime) {
        restaurantFilter.estimatedDeliveryTimeMinutes = { $lte: parseInt(maxDeliveryTime) };
    }
    
    console.log(`[Search-Service] Final Restaurant Filter:`, JSON.stringify(restaurantFilter));

    let restaurantIds = new Set();
    let restaurantDetailsMap = new Map();

    // 2. Handle Category Filtering (Restaurants don't have categoryId, FoodItems do)
    if (categoryId && mongoose.Types.ObjectId.isValid(categoryId)) {
        const catFoodItems = await FoodItem.find({ 
            categoryId: new mongoose.Types.ObjectId(categoryId),
            approvalStatus: 'approved' 
        }).select('restaurantId').lean();
        
        const catRestaurantIds = [...new Set(catFoodItems.map(f => f.restaurantId.toString()))];
        if (catRestaurantIds.length > 0) {
            restaurantFilter._id = { $in: catRestaurantIds.map(id => new mongoose.Types.ObjectId(id)) };
        } else {
            // No food items in this category -> No restaurants
            return {
                success: true,
                data: { restaurants: [], total: 0, page: parseInt(page), limit: parseInt(limit) }
            };
        }
    }

    // Pre-fetch eligible zone restaurant IDs to scope food searches strictly within the zone
    const eligibleZoneRestaurants = await FoodRestaurant.find(restaurantFilter).select('_id').lean();
    const eligibleZoneRestaurantIds = eligibleZoneRestaurants.map(r => r._id);

    if (eligibleZoneRestaurantIds.length === 0) {
        return {
            success: true,
            data: {
                restaurants: [],
                total: 0,
                page: parseInt(page),
                limit: parseInt(limit),
                zoneFiltered: !!(effectiveZoneId && mongoose.Types.ObjectId.isValid(effectiveZoneId))
            }
        };
    }

    // 3. Search Matching
    if (regex) {
        // A. Search by Restaurant Name / Cuisine
        const matchedRestaurants = await FoodRestaurant.find({
            ...restaurantFilter,
            $or: [
                { restaurantName: { $regex: regex } },
                { cuisines: { $regex: regex } }
            ]
        }).limit(limit * 2).lean();

        matchedRestaurants.forEach(r => {
            restaurantIds.add(r._id.toString());
            restaurantDetailsMap.set(r._id.toString(), { ...r, matchType: 'restaurant' });
        });

        // B. Search by Food Item Name (strictly scoped to eligible zone restaurants)
        const foodFilters = { 
            approvalStatus: 'approved',
            restaurantId: { $in: eligibleZoneRestaurantIds }
        };
        if (isVeg === 'true') foodFilters.foodType = 'Veg';
        
        const matchedFoods = await FoodItem.find({
            ...foodFilters,
            name: { $regex: regex }
        }).limit(limit * 2).lean();

        const foodRestaurantIds = matchedFoods.map(f => f.restaurantId.toString());
        
        if (foodRestaurantIds.length > 0) {
            const unmatchedIds = foodRestaurantIds.filter(id => !restaurantIds.has(id));
            if (unmatchedIds.length > 0) {
                const rsForFoods = await FoodRestaurant.find({
                    ...restaurantFilter,
                    _id: { $in: unmatchedIds.map(id => new mongoose.Types.ObjectId(id)) }
                }).lean();

                rsForFoods.forEach(r => {
                    restaurantIds.add(r._id.toString());
                    restaurantDetailsMap.set(r._id.toString(), { 
                        ...r, 
                        matchType: 'food',
                        matchedDish: matchedFoods.find(f => f.restaurantId.toString() === r._id.toString())?.name,
                        matchedDishImage: matchedFoods.find(f => f.restaurantId.toString() === r._id.toString())?.image,
                        matchedDishId: matchedFoods.find(f => f.restaurantId.toString() === r._id.toString())?._id
                    });
                });
            }
        }
    } else {
        // No search text -> List all restaurants matching filters (category/zone)
        const allMatching = await FoodRestaurant.find(restaurantFilter)
            .sort({ rating: -1, createdAt: -1 })
            .limit(limit * 2)
            .lean();
            
        allMatching.forEach(r => {
            restaurantIds.add(r._id.toString());
            restaurantDetailsMap.set(r._id.toString(), r);
        });
    }

    // 4. Final Result Formatting
    let results = Array.from(restaurantDetailsMap.values());

    // Simple distance sorting if lat/lng are provided
    if (lat && lng && results.length > 0) {
        results.forEach(res => {
            if (res.location && res.location.latitude && res.location.longitude) {
                const dLat = (res.location.latitude - lat) * Math.PI / 180;
                const dLon = (res.location.longitude - lng) * Math.PI / 180;
                const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                          Math.cos(lat * Math.PI / 180) * Math.cos(res.location.latitude * Math.PI / 180) *
                          Math.sin(dLon/2) * Math.sin(dLon/2);
                const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
                res.distanceScore = 6371 * c; // Km
            } else {
                res.distanceScore = 999;
            }
        });
        results.sort((a, b) => (a.distanceScore || 999) - (b.distanceScore || 999));
    }

    return {
        success: true,
        data: {
            restaurants: results.slice(skip, skip + limit),
            total: results.length,
            page: parseInt(page),
            limit: parseInt(limit),
            zoneFiltered: !!(effectiveZoneId && mongoose.Types.ObjectId.isValid(effectiveZoneId))
        }
    };
};

/**
 * Fetch Admin-only categories
 */
export const getAdminCategories = async (query = {}) => {
    const filter = { 
        isActive: true, 
        isApproved: true,
        $or: [
            { restaurantId: { $exists: false } },
            { restaurantId: null },
            { restaurantId: { $eq: undefined } }
        ]
    };

    if (query.zoneId && mongoose.Types.ObjectId.isValid(query.zoneId)) {
        filter.$or = [
            { zoneId: new mongoose.Types.ObjectId(query.zoneId) },
            { zoneId: { $exists: false } },
            { zoneId: null }
        ];
    }

    const categories = await FoodCategory.find(filter).sort({ sortOrder: 1, name: 1 }).lean();
    return categories;
};
