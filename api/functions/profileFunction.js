const db = require("../../config/db");
const { uploadexpenseFileToS3 } = require("../../config/s3");

exports.createOrUpdateProfile = async (user_id, profileData, file = null) => {
  const {
    dob,
    gender,
    mobile_no,
    emergency_contact_name,
    emergency_contact_no,
    blood_group,
    address,
    permanent_address,
  } = profileData;

  if (!user_id) {
    throw new Error("Missing required field: user_id");
  }

  let profileImageUrl = null;

  // Handle file upload
  if (file) {
    const fileBuffer = file.data;
    const originalFileName = file.name;
    const fileExtension = originalFileName.split(".").pop().toLowerCase();
    const allowedExtensions = ["jpg", "jpeg", "png"];

    if (!allowedExtensions.includes(fileExtension)) {
      throw new Error(
        `Invalid file type. Allowed types: ${allowedExtensions.join(", ")}`
      );
    }

    const uniqueFileName = `${user_id}_${Date.now()}_${originalFileName}`;
    profileImageUrl = await uploadexpenseFileToS3(fileBuffer, uniqueFileName);
  }

  // Check if profile exists
  const profileCheckQuery = `SELECT id FROM user_profiles WHERE user_id = ?`;
  const [existingProfile] = await db.query(profileCheckQuery, [user_id]);

  if (existingProfile.length > 0) {
    // Update existing profile
    const updateFields = [];
    const updateValues = [];

    // Dynamically build the update query based on provided data
    if (dob) {
      updateFields.push("dob = ?");
      updateValues.push(dob);
    }
    if (gender) {
      updateFields.push("gender = ?");
      updateValues.push(gender);
    }
    if (mobile_no) {
      updateFields.push("mobile_no = ?");
      updateValues.push(mobile_no);
    }
    if (emergency_contact_name) {
      updateFields.push("emergency_contact_name = ?");
      updateValues.push(emergency_contact_name);
    }
    if (emergency_contact_no) {
      updateFields.push("emergency_contact_no = ?");
      updateValues.push(emergency_contact_no);
    }
    if (blood_group) {
      updateFields.push("blood_group = ?");
      updateValues.push(blood_group);
    }
    if (address) {
      updateFields.push("address = ?");
      updateValues.push(address);
    }
    if (permanent_address) {
      updateFields.push("permanent_address = ?");
      updateValues.push(permanent_address);
    }
    if (profileImageUrl) {
      updateFields.push("profile_img = ?");
      updateValues.push(profileImageUrl);
    }

    if (updateFields.length > 0) {
      const updateQuery = `
        UPDATE user_profiles
        SET ${updateFields.join(", ")}, updated_at = NOW()
        WHERE user_id = ?
      `;
      updateValues.push(user_id);
      await db.query(updateQuery, updateValues);
    }

    return { user_id, message: "Profile updated successfully" };
  } else {
    // Insert new profile
    const insertQuery = `
      INSERT INTO user_profiles (
        user_id, dob, gender, mobile_no, emergency_contact_name, 
        emergency_contact_no, blood_group, address, permanent_address, 
        profile_img, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `;
    const insertValues = [
      user_id,
      dob || null,
      gender || null,
      mobile_no || null,
      emergency_contact_name || null,
      emergency_contact_no || null,
      blood_group || null,
      address || null,
      permanent_address || null,
      profileImageUrl || null,
    ];
    await db.query(insertQuery, insertValues);
    return { user_id, message: "Profile created successfully" };
  }
};


