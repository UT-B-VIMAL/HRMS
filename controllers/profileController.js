const profileFunctions = require('../api/functions/profileFunction');
const { successResponse, errorResponse } = require('../helpers/responseHelper');

exports.createOrUpdateProfile = async (req, res) => {
    try {
        const { user_id } = req.body;

        if (!user_id) {
            return errorResponse(res, null, 'User ID is required', 400);
        }

        const result = await profileFunctions.createOrUpdateProfile(user_id, req.body);

        return successResponse(res, result, 'Profile created or updated successfully');
    } catch (error) {
        console.error('Error creating or updating profile:', error);
        return errorResponse(res, error.message, 'Error creating or updating profile', 500);
    }
};
