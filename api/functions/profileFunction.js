const db = require('../../config/db'); 

exports.createOrUpdateProfile = async (user_id, profileData) => {
    const [existingProfile] = await db.query(
        `SELECT * FROM user_profiles WHERE user_id = ?`,
        [user_id]
    );

    if (existingProfile.length > 0) {
        const updateQuery = `
            UPDATE user_profiles
            SET dob = ?, gender = ?, mobile_no = ?, emergency_contact_name = ?, emergency_contact_no = ?,
                personal_email = ?, blood_group = ?, aadhar_no = ?, pan_no = ?, address = ?, permanent_address = ?, pincode = ?
            WHERE user_id = ?
        `;

        const values = [
            profileData.dob,
            profileData.gender,
            profileData.mobile_no,
            profileData.emergency_contact_name,
            profileData.emergency_contact_no,
            profileData.personal_email,
            profileData.blood_group,
            profileData.aadhar_no,
            profileData.pan_no,
            profileData.address,
            profileData.permanent_address,
            profileData.pincode,
            user_id,
        ];

        const [updateResult] = await db.query(updateQuery, values);
        return { message: 'Profile updated successfully', affectedRows: updateResult.affectedRows };
    } else {
        // Profile does not exist, create it
        const insertQuery = `
            INSERT INTO user_profiles (
                user_id, dob, gender, mobile_no, emergency_contact_name, emergency_contact_no,
                personal_email, blood_group, aadhar_no, pan_no, address, permanent_address, pincode
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const values = [
            user_id,
            profileData.dob,
            profileData.gender,
            profileData.mobile_no,
            profileData.emergency_contact_name,
            profileData.emergency_contact_no,
            profileData.personal_email,
            profileData.blood_group,
            profileData.aadhar_no,
            profileData.pan_no,
            profileData.address,
            profileData.permanent_address,
            profileData.pincode,
        ];

        const [insertResult] = await db.query(insertQuery, values);
        return { message: 'Profile created successfully', insertId: insertResult.insertId };
    }
};
