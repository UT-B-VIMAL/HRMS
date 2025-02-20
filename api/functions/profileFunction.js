const db = require("../../config/db");
const { uploadexpenseFileToS3 } = require("../../config/s3");

// Core reusable function
exports.createOrUpdateProfile = async (user_id, profileData, file = null) => {
  const {
    dob,
    gender,
    mobile_no,
    emergency_contact_name,
    emergency_contact_no,
    blood_group,
    address,
    permanent_address
  } = profileData;

  // Validate required fields
  const missingFields = [];
  if (!user_id) missingFields.push("user_id");
  if (!dob) missingFields.push("dob");
  if (!gender) missingFields.push("gender");
  if (!mobile_no) missingFields.push("mobile_no");

  if (missingFields.length > 0) {
    throw new Error(`Missing required fields: ${missingFields.join(", ")}`);
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

  console.log("profileImageUrl", profileImageUrl);

  // Check if profile exists
  const profileCheckQuery = `SELECT id FROM user_profiles WHERE user_id = ?`;
  const [existingProfile] = await db.query(profileCheckQuery, [user_id]);

  if (existingProfile.length > 0) {
    // Update existing profile
    const updateQuery = `
      UPDATE user_profiles
      SET dob = ?, gender = ?, mobile_no = ?, emergency_contact_name = ?, 
          emergency_contact_no = ?, blood_group = ?, address = ?, 
          permanent_address = ?, profile_img = ?, updated_at = NOW()
      WHERE user_id = ?
    `;
    const updateValues = [
      dob,
      gender,
      mobile_no,
      emergency_contact_name,
      emergency_contact_no,
      blood_group,
      address,
      permanent_address,
      profileImageUrl,
      user_id,
    ];
    await db.query(updateQuery, updateValues);
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
      dob,
      gender,
      mobile_no,
      emergency_contact_name,
      emergency_contact_no,
      blood_group,
      address,
      permanent_address,
      profileImageUrl
    ];
    await db.query(insertQuery, insertValues);
    return { user_id, message: "Profile created successfully" };
  }
};
