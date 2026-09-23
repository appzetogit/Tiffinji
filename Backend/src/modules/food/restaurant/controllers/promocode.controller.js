import { FoodOffer } from '../../admin/models/offer.model.js';
import { FoodRestaurant } from '../models/restaurant.model.js';
import { sendResponse, sendError } from '../../../../utils/response.js';
import { logger } from '../../../../utils/logger.js';

// Helper to map DB offer doc to frontend promocode shape
const mapOfferToPromocode = (offer) => ({
    _id: offer._id,
    code: offer.couponCode,
    description: offer.description || `${offer.discountType === 'percentage' ? `${offer.discountValue}% OFF` : `₹${offer.discountValue} OFF`}`,
    discountType: offer.discountType === 'flat-price' ? 'FLAT' : 'PERCENTAGE',
    discountValue: offer.discountValue,
    minOrderAmount: offer.minOrderValue || 0,
    maxDiscountAmount: offer.maxDiscount || null,
    expiryDate: offer.endDate || null,
    usageLimit: offer.usageLimit || null,
    usedCount: offer.usedCount || 0,
    isActive: offer.status === 'active'
});

/**
 * GET /api/v1/food/restaurant/promocodes
 * Fetch all promocodes created for the logged-in restaurant
 */
export const getRestaurantPromocodes = async (req, res, next) => {
    try {
        const userId = req.user?.userId;
        const restaurant = await FoodRestaurant.findOne({
            $or: [{ _id: userId }, { ownerPhone: req.user?.phone }]
        });

        const restaurantId = restaurant ? restaurant._id : userId;

        const offers = await FoodOffer.find({ restaurantId }).sort({ createdAt: -1 });

        const promocodeList = offers.map(mapOfferToPromocode);

        return sendResponse(res, 200, 'Promocodes fetched successfully', { promocodeList });
    } catch (error) {
        logger.error(`Error in getRestaurantPromocodes: ${error.message}`);
        return next(error);
    }
};

/**
 * POST /api/v1/food/restaurant/promocodes
 * Create a new promocode for the logged-in restaurant
 */
export const createRestaurantPromocode = async (req, res, next) => {
    try {
        const userId = req.user?.userId;
        const restaurant = await FoodRestaurant.findOne({
            $or: [{ _id: userId }, { ownerPhone: req.user?.phone }]
        });

        const restaurantId = restaurant ? restaurant._id : userId;
        const {
            code,
            description,
            discountType,
            discountValue,
            minOrderAmount,
            maxDiscountAmount,
            expiryDate,
            usageLimit
        } = req.body;

        if (!code || !discountValue) {
            return sendError(res, 400, 'Promo code and discount value are required.');
        }

        const couponCode = String(code).trim().toUpperCase();

        const existing = await FoodOffer.findOne({ couponCode });
        if (existing) {
            return sendError(res, 400, `Promo code "${couponCode}" already exists.`);
        }

        const newOffer = await FoodOffer.create({
            couponCode,
            discountType: discountType === 'FLAT' ? 'flat-price' : 'percentage',
            discountValue: Number(discountValue),
            customerScope: 'all',
            restaurantScope: 'selected',
            restaurantId,
            minOrderValue: Number(minOrderAmount) || 0,
            maxDiscount: maxDiscountAmount ? Number(maxDiscountAmount) : null,
            usageLimit: usageLimit ? Number(usageLimit) : null,
            endDate: expiryDate ? new Date(expiryDate) : null,
            status: 'active',
            showInCart: true
        });

        return sendResponse(res, 201, 'Promo code created successfully', {
            promocode: mapOfferToPromocode(newOffer)
        });
    } catch (error) {
        logger.error(`Error in createRestaurantPromocode: ${error.message}`);
        return next(error);
    }
};

/**
 * PATCH /api/v1/food/restaurant/promocodes/:id
 * Toggle status or update promocode
 */
export const toggleRestaurantPromocodeStatus = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { isActive } = req.body;

        const offer = await FoodOffer.findById(id);
        if (!offer) {
            return sendError(res, 404, 'Promo code not found.');
        }

        offer.status = isActive ? 'active' : 'paused';
        await offer.save();

        return sendResponse(res, 200, 'Promo code status updated', {
            promocode: mapOfferToPromocode(offer)
        });
    } catch (error) {
        logger.error(`Error in toggleRestaurantPromocodeStatus: ${error.message}`);
        return next(error);
    }
};

/**
 * DELETE /api/v1/food/restaurant/promocodes/:id
 * Delete a promocode
 */
export const deleteRestaurantPromocode = async (req, res, next) => {
    try {
        const { id } = req.params;
        const offer = await FoodOffer.findByIdAndDelete(id);
        if (!offer) {
            return sendError(res, 404, 'Promo code not found.');
        }

        return sendResponse(res, 200, 'Promo code deleted successfully');
    } catch (error) {
        logger.error(`Error in deleteRestaurantPromocode: ${error.message}`);
        return next(error);
    }
};
