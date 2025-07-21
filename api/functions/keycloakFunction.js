const axios = require('axios');
const bcrypt = require('bcryptjs');
const keycloakConfig = require('../../config/keycloak');
const db = require('../../config/db');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const moment = require('moment');
const { successResponse, errorResponse } = require('../../helpers/responseHelper');
require('dotenv').config();

async function getAdminToken() {
  try {
    const response = await axios.post(
      `${keycloakConfig.serverUrl}/realms/${keycloakConfig.realm}/protocol/openid-connect/token`,
      new URLSearchParams({
        grant_type: "password",
        client_id: keycloakConfig.clientId,
        client_secret: keycloakConfig.clientSecret,
        username: keycloakConfig.adminUsername,
        password: keycloakConfig.adminPassword,
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );
    return response.data.access_token;
  } catch (error) {
    if (error.response) {
      console.error("Error fetching Keycloak admin token:", error.response.data);
    } else {
      console.error("Error fetching Keycloak admin token:", error.message);
    }
    throw error;
  }
}

async function signInUser(username, password) {
  try {
    const response = await axios.post(
      `${keycloakConfig.serverUrl}/realms/${keycloakConfig.realm}/protocol/openid-connect/token`,
      new URLSearchParams({
        grant_type: "password",
        client_id: keycloakConfig.clientId,
        client_secret: keycloakConfig.clientSecret,
        username: username,
        password: password,
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const user = await getUserByEmployeeId(username);


    if (user) {
      const role = await getRoleName(user.role_id);
      let profileName = '';
      if (user.last_name) {
        const firstNameInitial = user.first_name ? user.first_name.charAt(0).toUpperCase() : '';
        const lastNameInitial = user.last_name.charAt(0).toUpperCase();
        profileName = `${firstNameInitial}${lastNameInitial}`;
      } else if (user.first_name) {
        profileName = user.first_name.substring(0, 2).toUpperCase();
      }
      const expiresInSeconds = response.data.expires_in;
      const loginExpiry = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

      return {
        keycloak_id: user.keycloak_id,
        user_id: user.id,
        role_id: user.role_id,
        employee_id: user.employee_id,
        profile_name: profileName,
        designation_name: user.designation_name,
        role_name: role,
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token,
        login_expiry: loginExpiry
      };
    } else {
      throw new Error('User not found in the database');
    }
  } catch (error) {
    console.error("Error signing in user:", error.response ? error.response.data : error.message);
    throw error;
  }
}

async function logoutUser(refreshToken) {
  try {
    const response = await axios.post(
      `${keycloakConfig.serverUrl}/realms/${keycloakConfig.realm}/protocol/openid-connect/logout`,
      new URLSearchParams({
        client_id: keycloakConfig.clientId,
        client_secret: keycloakConfig.clientSecret,
        refresh_token: refreshToken,
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    // Return success message
    return { message: "Logout successful", data: response.data };
  } catch (error) {
    console.error("Error logging out user:", error.response ? error.response.data : error.message);
    throw new Error("Failed to log out the user.");
  }
}

async function changePassword(id, payload, res) {
  const { current_password, new_password } = payload;

  try {
    const query = `SELECT id, email, password, keycloak_id FROM users WHERE id = ?`;
    const [user] = await db.query(query, [id]);

    if (!user || user.length === 0) {
      return errorResponse(res, null, 'User not found', 404);
    }

    const currentUser = user[0];

    const isPasswordCorrect = await bcrypt.compare(current_password, currentUser.password);
    if (!isPasswordCorrect) {
      return errorResponse(res, null, 'The current password is incorrect', 400);
    }

    const hashedPassword = await bcrypt.hash(new_password, 10);
    const updateQuery = `UPDATE users SET password = ? WHERE id = ?`;
    const [result] = await db.query(updateQuery, [hashedPassword, id]);

    if (result.affectedRows === 0) {
      return errorResponse(res, null, 'User not found or password not updated', 500);
    }

    await changePasswordInKeycloak(currentUser.keycloak_id, new_password);

    return successResponse(res, { id, ...payload }, 'Password updated successfully');
  } catch (error) {
    console.error("Error updating password:", error);
    return errorResponse(res, error.message, 'Error updating password', 500);
  }
}



async function forgotPassword(email, res) {
  try {
    const query = "SELECT id, email FROM users WHERE email = ?";
    const [user] = await db.query(query, [email]);

    if (!user || user.length === 0) {
      return errorResponse(res, null, 'User not found with this email', 404);
    }

    const currentUser = user[0];

    // Generate 4-digit OTP
    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    const otpExpiry = moment().add(10, 'minutes').format('YYYY-MM-DD HH:mm:ss');

    // Save OTP in DB
    const updateQuery = "UPDATE users SET reset_token = ?, reset_token_expiry = ? WHERE id = ?";
    await db.query(updateQuery, [otp, otpExpiry, currentUser.id]);

    // Setup Nodemailer
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: 'nathishmanadarajan@gmail.com',
        pass: 'zlmu qdlu qgpg phnm', // NOTE: Use environment variables for security!
      },
    });
    const logoUrl = process.env.LOGO_URL;

    const mailOptions = {
      from: 'nathishmanadarajan@gmail.com',
      to: currentUser.email,
      subject: 'Your Password Reset OTP',
      html: `
    <div style="
      font-family: Arial, sans-serif; 
      padding: 30px; 
      background-color: #f2f4f6;  /* Outer background unchanged */
      min-height: 100vh;
    ">
      <div style="
        max-width: 600px; 
        margin: auto; 
        border-radius: 8px; 
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05); 
        overflow: hidden;

        /* Transparent gradient inside container only */
        background: linear-gradient(
          135deg, 
          rgba(42, 122, 226, 0.15) 0%,    /* bright blue transparent */
          rgba(27, 61, 145, 0.12) 40%,    /* dark blue transparent */
          rgba(40, 167, 69, 0.15) 70%,    /* fresh green transparent */
          rgba(255, 255, 255, 0.1) 100%   /* white transparent */
        );

        padding: 30px;
      ">

        <!-- Header -->
        <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 25px;">
          <img src="${process.env.LOGO_URL}" alt="Unity Pvt Limited Logo" style="height: 40px;">
        
        </div>
        <h2 style="margin: 0; font-size: 18px; color: #2c3e50; display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 16px;">🔐</span> Password Reset Request
        </h2>

        <!-- Body -->
        <p style="font-size: 16px; color: #333;">Hi there,</p>
        <p style="font-size: 16px; color: #333;">
          We received a request to reset the password for your <strong>Unity Pvt Limited</strong> account. Please use the OTP below to proceed.
        </p>

        <div style="margin: 25px 0; text-align: center;">
          <div style="
            display: inline-block; 
            background-color: #f0f0f0; 
            padding: 15px 30px; 
            border-radius: 8px; 
            font-size: 24px; 
            font-weight: bold; 
            letter-spacing: 5px; 
            color: #2c3e50;
          ">
            ${otp}
          </div>
        </div>

        <p style="font-size: 16px; color: #333;">
          This OTP is valid for <strong>10 minutes</strong>. Please do not share it with anyone.
        </p>

        <p style="font-size: 14px; color: #777;">
          If you didn’t request a password reset, please ignore this email or contact our support.
        </p>

        <p style="margin-top: 40px; font-size: 16px; color: #333;">
          Regards,<br>
          <strong>Unity Pvt Limited</strong>
        </p>

        <!-- Footer -->
        <div style="
          background-color: #f9f9f9; 
          text-align: center; 
          padding: 20px; 
          font-size: 12px; 
          color: #999;
          margin-top: 30px;
          border-radius: 0 0 8px 8px;
        ">
          Unity Pvt Limited<br>
          126, Estate Main Rd, Industrial Estate, Perungudi,<br>
          Chennai, Tamil Nadu 600096
        </div>

      </div>
    </div>
  `
    };



    await transporter.sendMail(mailOptions);

    return successResponse(res, { otp, id: currentUser.id }, 'OTP has been sent to your email.');
  } catch (error) {
    console.error('Error sending OTP:', error);
    return errorResponse(res, error.message, 'Error sending OTP', 500);
  }
}

// After token validation and password update by user, reset password in Keycloak
async function resetPasswordWithKeycloak(id, newPassword, res) {
  try {
    const query = "SELECT id, password, keycloak_id FROM users WHERE id = ?";
    const [user] = await db.query(query, [id]);

    if (!user || user.length === 0) {
      return errorResponse(res, null, 'User not found', 404);
    }

    const currentUser = user[0];

    // Prevent reusing the old password
    const isSamePassword = await bcrypt.compare(newPassword, currentUser.password);
    if (isSamePassword) {
      return errorResponse(res, null, 'New password cannot be same as the previous password', 400);
    }

    // Hash and update new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const updateQuery = "UPDATE users SET password = ?, reset_token = NULL, reset_token_expiry = NULL WHERE id = ?";
    await db.query(updateQuery, [hashedPassword, id]);

    // Update password in Keycloak
    await changePasswordInKeycloak(currentUser.keycloak_id, newPassword);

    return successResponse(res, null, 'Password updated successfully in both system and Keycloak.');
  } catch (error) {
    console.error("Error resetting password:", error);
    return errorResponse(res, error.message, 'Error resetting password', 500);
  }
}





async function createUserInKeycloak(userData) {
  try {
    const token = await getAdminToken();

    const { roleName, ...userWithoutRole } = userData;

    console.log("User Data Payload:", userWithoutRole);

    const response = await axios.post(
      `${keycloakConfig.serverUrl}/admin/realms/${keycloakConfig.realm}/users`,
      userWithoutRole,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const userId = response.headers.location ? response.headers.location.split('/').pop() : null;
    if (!userId) {
      throw new Error('Failed to retrieve user ID after creation');
    }

    if (roleName) {
      try {
        const roleres = await assignRoleToUser(userId, roleName);
        console.log(roleName + 'Group');
        const groupResponse = await assignGroupToUser(userId, roleName + 'Group');

        if (groupResponse.error) {
          console.error("Group assignment failed:", groupResponse.details);
        } else {
          console.log(groupResponse.message);
        }
        console.log("Role assigned successfully");
        response['roleresponse'] = roleres;
      } catch (roleError) {
        console.error("Error assigning role:", roleError.message);
        response['roleresponse'] = roleError.message;
      }
    }

    return userId;
  } catch (error) {
    if (error.response) {
      console.error("Error creating user in Keycloak:", error.response.data);

      return {
        status: error.response.status || 500,
        message: error.response.data.error_description || "Unknown Keycloak error",
        error: error.response.data.error || "Unknown error",
      };
    } else {
      console.error("General error in Keycloak user creation:", error.message);
      throw new Error('Error creating user in Keycloak: ' + error.message);
    }
  }
}





async function editUserInKeycloak(userId, userData) {
  try {
    const token = await getAdminToken();
    const { roleName, ...userWithoutRole } = userData;
    const response = await axios.put(
      `${keycloakConfig.serverUrl}/admin/realms/${keycloakConfig.realm}/users/${userId}`,
      userWithoutRole,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (roleName) {
      try {
        const roleres = await assignRoleToUser(userId, roleName);
        console.log(roleName + 'Group');
        const groupResponse = await assignGroupToUser(userId, roleName + 'Group');

        if (groupResponse.error) {
          console.error("Group assignment failed:", groupResponse.details);
        } else {
          console.log(groupResponse.message);
        }
        console.log("Role assigned successfully");
        response['roleresponse'] = roleres;
      } catch (roleError) {
        console.error("Error assigning role:", roleError.message);
        response['roleresponse'] = roleError.message;
      }
    }
    return response.data;
  } catch (error) {
    console.error("Error editing user in Keycloak:", error.response.data);
    throw error;
  }
}

async function deleteUserInKeycloak(userId) {
  try {
    const token = await getAdminToken();
    const response = await axios.delete(
      `${keycloakConfig.serverUrl}/admin/realms/${keycloakConfig.realm}/users/${userId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (response.status === 204) {
      console.log(`User ${userId} deleted successfully.`);
    } else {
      console.log('Unexpected response:', response.data);
    }
  } catch (error) {
    if (error.response?.status === 404) {
      console.error("User not found in Keycloak.");
    } else if (error.response?.status === 409) {
      console.error("Conflict occurred while deleting the user.");
    } else {
      console.error("Error deleting user in Keycloak:", error.response?.data || error.message);
    }
    throw error;
  }
}


async function listUsers() {
  try {
    const token = await getAdminToken(); // Get the admin access token
    const response = await axios.get(
      `${keycloakConfig.serverUrl}/admin/realms/${keycloakConfig.realm}/users`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return response.data;
  } catch (error) {
    console.error("Error listing roles:", error.response.data);
    throw error;
  }
}

// Assign role to the user
async function assignRoleToUser(userId, roleName) {
  try {
    const token = await getAdminToken();

    // Get the role to be assigned
    const roleResponse = await axios.get(
      `${keycloakConfig.serverUrl}/admin/realms/${keycloakConfig.realm}/roles/${roleName}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const role = roleResponse.data;

    // Get currently assigned roles for the user
    const assignedRolesResponse = await axios.get(
      `${keycloakConfig.serverUrl}/admin/realms/${keycloakConfig.realm}/users/${userId}/role-mappings/realm`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const assignedRoles = assignedRolesResponse.data;

    // Unassign any roles the user already has (if it's different from the new role)
    const rolesToRemove = assignedRoles.filter((assignedRole) => assignedRole.name !== roleName);

    if (rolesToRemove.length > 0) {
      // Remove all roles that are not the new role
      await axios.delete(
        `${keycloakConfig.serverUrl}/admin/realms/${keycloakConfig.realm}/users/${userId}/role-mappings/realm`,
        {
          headers: { Authorization: `Bearer ${token}` },
          data: rolesToRemove,
        }
      );
    }

    // Assign the new role
    await axios.post(
      `${keycloakConfig.serverUrl}/admin/realms/${keycloakConfig.realm}/users/${userId}/role-mappings/realm`,
      [role],
      { headers: { Authorization: `Bearer ${token}` } }
    );

    return { message: 'Role assigned successfully' };

  } catch (error) {
    return { error: "Failed to assign or reassign role", details: error.response?.data || error.message };
  }
}

async function assignGroupToUser(userId, groupName) {
  try {
    const token = await getAdminToken();

    // Get the group to be assigned
    const groupResponse = await axios.get(
      `${keycloakConfig.serverUrl}/admin/realms/${keycloakConfig.realm}/groups`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const group = groupResponse.data.find((g) => g.name === groupName);

    if (!group) {
      return { error: `Group '${groupName}' not found` };
    }

    // Get currently assigned groups for the user
    const assignedGroupsResponse = await axios.get(
      `${keycloakConfig.serverUrl}/admin/realms/${keycloakConfig.realm}/users/${userId}/groups`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const assignedGroups = assignedGroupsResponse.data;

    // Remove the user from any groups that do not match the new group
    const groupsToRemove = assignedGroups.filter((assignedGroup) => assignedGroup.id !== group.id);

    for (const groupToRemove of groupsToRemove) {
      await axios.delete(
        `${keycloakConfig.serverUrl}/admin/realms/${keycloakConfig.realm}/users/${userId}/groups/${groupToRemove.id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
    }

    // Assign the user to the new group
    await axios.put(
      `${keycloakConfig.serverUrl}/admin/realms/${keycloakConfig.realm}/users/${userId}/groups/${group.id}`,
      null, // No body is required for this request
      { headers: { Authorization: `Bearer ${token}` } }
    );

    return { message: 'Group assigned successfully' };

  } catch (error) {
    return { error: "Failed to assign or reassign group", details: error.response?.data || error.message };
  }
}




async function getUserByEmployeeId(identifier) {
  const query = `
    SELECT 
      users.id, 
      users.keycloak_id, 
      users.role_id, 
      users.employee_id, 
      users.first_name, 
      users.last_name, 
      users.designation_id AS designation_name
    FROM users
    LEFT JOIN designations ON users.designation_id = designations.id
    WHERE (users.employee_id = ? OR users.email = ?) AND users.deleted_at IS NULL
  `;
  
  const params = [identifier, identifier];

  try {
    const [rows] = await db.execute(query, params); // Use your DB query method here

    if (rows.length > 0) {
      return rows[0]; // Return the first matched user
    } else {
      return null; // No user found
    }
  } catch (error) {
    console.error("Error querying database for user:", error.message);
    throw error;
  }
}


const getRoleName = async (roleId) => {
  const query = "SELECT role FROM roles WHERE id = ?"; // Select 'role' column
  const values = [roleId];
  const [result] = await db.query(query, values);


  return result.length > 0 ? result[0].role : null; // Return 'role' from the result
};


async function changePasswordInKeycloak(userId, newPassword) {
  try {
    const token = await getAdminToken(); // Get admin token

    const url = `${keycloakConfig.serverUrl}/admin/realms/${keycloakConfig.realm}/users/${userId}/reset-password`;

    const payload = {
      type: "password",
      value: newPassword,
      temporary: false, // Set temporary to false, meaning user doesn't have to change password on next login
    };

    // Make the PUT request to change the password in Keycloak
    const response = await axios.put(url, payload, {
      headers: {
        Authorization: `Bearer ${token}`, // Use the Bearer token for authentication
        "Content-Type": "application/json",
      },
    });

    console.log("Password successfully updated in Keycloak:", response.data);
  } catch (error) {
    console.error("Error updating password in Keycloak:", error.response?.data || error.message);
    throw new Error("Failed to update password in Keycloak");
  }
};






module.exports = {
  createUserInKeycloak,
  editUserInKeycloak,
  deleteUserInKeycloak,
  listUsers,
  assignRoleToUser,
  signInUser,
  logoutUser,
  changePassword,
  forgotPassword,
  resetPasswordWithKeycloak,
  getAdminToken
};


