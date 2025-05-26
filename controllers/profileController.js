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


const formatDate = (dateString) => {
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are 0-based
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
};

exports.getProfile = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id) {
            return errorResponse(res, null, 'User ID is required', 400);
        }

        const query = `
            SELECT 
                p.user_id,
                CONCAT(u.first_name, ' ', u.last_name) AS name,
                u.designation_id AS designation,
                u.email,
                t.name as team_name,
                p.dob,
                p.gender,
                p.mobile_no,
                p.emergency_contact_name,
                p.emergency_contact_no,
                p.blood_group,
                p.address,
                p.permanent_address,
                p.profile_img
            FROM user_profiles p
            LEFT JOIN users u ON p.user_id = u.id
            LEFT JOIN teams t ON u.team_id = t.id
            WHERE p.user_id = ?`;

        const [profile] = await db.query(query, [id]);

        if (!profile || profile.length === 0) {
            // Fetch basic user data if profile not found
            const userQuery = `
                SELECT 
                    CONCAT(u.first_name, ' ', u.last_name) AS name,
                    u.designation_id AS designation,
                    u.email,
                    t.name as team_name
                FROM users u
                LEFT JOIN teams t ON u.team_id = t.id
                WHERE u.id = ?`;
            const [user] = await db.query(userQuery, [id]);

            if (!user || user.length === 0) {
                return errorResponse(res, null, 'Profile not found', 404);
            }

            return successResponse(res, user[0], 'Basic user data retrieved successfully');
        }

        profile[0].dob = profile[0].dob ? formatDate(profile[0].dob) : null;

        return successResponse(res, profile[0], 'Profile retrieved successfully');
    } catch (error) {
        console.error('Error retrieving profile:', error.message);
        return errorResponse(res, error.message, 'Error retrieving profile', 500);
    }
};





