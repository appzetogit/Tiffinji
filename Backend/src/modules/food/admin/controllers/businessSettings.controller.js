import { FoodBusinessSettings } from '../models/businessSettings.model.js';
import { sendResponse } from '../../../../utils/response.js';
import { uploadImageBufferDetailed } from '../../../../services/cloudinary.service.js';

export async function getBusinessSettings(req, res, next) {
    try {
        let settings = await FoodBusinessSettings.findOne().lean();
        if (!settings) {
            // Create default settings if none exist
            settings = await FoodBusinessSettings.create({
                companyName: 'Appzeto',
                email: 'admin@appzeto.com'
            });
        }
        return sendResponse(res, 200, 'Business settings fetched successfully', settings);
    } catch (error) {
        next(error);
    }
}

export async function updateBusinessSettings(req, res, next) {
    try {
        let settings = await FoodBusinessSettings.findOne();
        if (!settings) {
            settings = new FoodBusinessSettings();
        }

        // Safer data parsing that handles both JSON and multipart/form-data
        let data = {};
        try {
            if (req.body && req.body.data) {
                data = typeof req.body.data === 'string' ? JSON.parse(req.body.data) : req.body.data;
            } else if (req.body) {
                data = req.body;
            }
        } catch (err) {
            return res.status(400).json({ success: false, message: 'Invalid data format' });
        }

        const { 
            companyName, email, phoneCountryCode, phoneNumber, address, state, pincode, region,
            supportEmail, supportPhone, supportHours 
        } = data || {};

        // Merge incoming fields with existing settings if omitted
        const s_companyName = companyName !== undefined && String(companyName).trim() !== ''
            ? String(companyName).trim()
            : (settings.companyName || 'Appzeto');
            
        const s_email = email !== undefined && String(email).trim() !== ''
            ? String(email).trim()
            : (settings.email || 'admin@appzeto.com');
            
        const s_phoneNumber = phoneNumber !== undefined && String(phoneNumber).trim() !== ''
            ? String(phoneNumber).trim()
            : (settings.phone?.number || '9999999999');

        const s_address = address !== undefined ? String(address).trim() : (settings.address || '');
        const s_state = state !== undefined ? String(state).trim() : (settings.state || '');
        const s_pincode = pincode !== undefined ? String(pincode).trim() : (settings.pincode || '');
        const s_supportEmail = supportEmail !== undefined ? String(supportEmail).trim() : (settings.supportEmail || '');
        const s_supportPhone = supportPhone !== undefined ? String(supportPhone).trim() : (settings.supportPhone || '');
        const s_supportHours = supportHours !== undefined ? String(supportHours).trim() : (settings.supportHours || '');

        // Validation
        if (!s_companyName || s_companyName.length < 2 || s_companyName.length > 100) {
            return res.status(400).json({ success: false, message: 'Company name must be between 2 and 100 characters' });
        }
        if (s_email && (s_email.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s_email))) {
            return res.status(400).json({ success: false, message: 'Invalid email address' });
        }
        if (s_phoneNumber && !/^\+?\d{7,15}$/.test(s_phoneNumber.replace(/[\s-]/g, ''))) {
            return res.status(400).json({ success: false, message: 'Invalid phone number (7-15 digits required)' });
        }
        if (s_address && s_address.length > 250) {
            return res.status(400).json({ success: false, message: 'Address is too long (max 250 characters)' });
        }
        if (s_state && s_state.length > 50) {
            return res.status(400).json({ success: false, message: 'State name is too long (max 50 characters)' });
        }
        if (s_pincode && !/^\d{4,10}$/.test(s_pincode)) {
            return res.status(400).json({ success: false, message: 'Invalid pincode (4-10 digits required)' });
        }
        if (s_supportEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s_supportEmail)) {
            return res.status(400).json({ success: false, message: 'Invalid support email address' });
        }

        settings.companyName = s_companyName;
        settings.email = s_email;
        settings.phone = {
            countryCode: String(phoneCountryCode || settings.phone?.countryCode || '+91').trim(),
            number: s_phoneNumber
        };
        if (address !== undefined) settings.address = s_address;
        if (state !== undefined) settings.state = s_state;
        if (pincode !== undefined) settings.pincode = s_pincode;
        if (region) settings.region = String(region).trim();
        
        if (supportEmail !== undefined) settings.supportEmail = s_supportEmail;
        if (supportPhone !== undefined) settings.supportPhone = s_supportPhone;
        if (supportHours !== undefined) settings.supportHours = s_supportHours;

        // Handle file uploads
        if (req.files) {
            if (req.files.logo && req.files.logo[0]) {
                const logoResult = await uploadImageBufferDetailed(req.files.logo[0].buffer, 'business/logos');
                if (logoResult) {
                    settings.logo = {
                        url: logoResult.url || logoResult.secure_url || '',
                        publicId: logoResult.publicId || logoResult.public_id || ''
                    };
                }
            }
            if (req.files.favicon && req.files.favicon[0]) {
                const faviconResult = await uploadImageBufferDetailed(req.files.favicon[0].buffer, 'business/favicons');
                if (faviconResult) {
                    settings.favicon = {
                        url: faviconResult.url || faviconResult.secure_url || '',
                        publicId: faviconResult.publicId || faviconResult.public_id || ''
                    };
                }
            }
        }

        await settings.save();
        return sendResponse(res, 200, 'Business settings updated successfully', settings);
    } catch (error) {
        console.error('Error updating business settings:', error);
        next(error);
    }
}
