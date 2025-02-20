const profileFunctions = require('../api/functions/profileFunction');
const db = require("../config/db");
const { successResponse, errorResponse } = require('../helpers/responseHelper');

exports.createOrUpdateProfile = async (req, res) => {
    try {
        const { user_id } = req.body || {}; // Fallback to empty object if req.body is undefined
  

        if (!user_id) {
            return res.status(400).json({ success: false, message: 'User ID is required' });
        }

        const profileData = req.body;
        const file = req.files?.profile_image || null;

        const result = await profileFunctions.createOrUpdateProfile(user_id, profileData, file);

        return res.status(200).json({ success: true, message: 'Profile created or updated successfully', data: result });
    } catch (error) {
        console.error('Error creating or updating profile:', error.message);
        return res.status(500).json({ success: false, message: 'Error creating or updating profile', error: error.message });
    }
};

exports.getProfile = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id) {
            return res.status(400).json(errorResponse('User ID is required'));
        }

        const query = `
            SELECT user_id, dob, gender, mobile_no, emergency_contact_name, 
                   emergency_contact_no, blood_group, address, permanent_address, profile_img
            FROM user_profiles 
            WHERE user_id = ?`;
        const [profile] = await db.query(query, [id]);

        if (!profile || profile.length === 0) {
            return res.status(404).json(errorResponse('Profile not found'));
        }

        return res.status(200).json(successResponse('Profile retrieved successfully', profile[0]));
    } catch (error) {
        console.error('Error retrieving profile:', error.message);
        return res.status(500).json(errorResponse('Error retrieving profile', error.message));
    }
};



