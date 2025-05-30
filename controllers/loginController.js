const { signInUser, logoutUser, changePassword, forgotPassword,verifyOtp,resetPasswordWithKeycloak } = require("../api/functions/keycloakFunction");
const { changePasswordSchema } = require("../validators/authValidator");
const { successResponse, errorResponse } = require('../helpers/responseHelper');
const db = require("../config/db");

exports.login = async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }

  try {
    const tokens = await signInUser(username, password);
    res.status(200).json({ message: "Login successful", tokens });
  } catch (error) {
    res.status(401).json({ error: "Failed to login", details: error.response?.data || error.message });
  }
};


exports.logout = async (req, res) => {
  const { refresh_token } = req.body;

  if (!refresh_token) {
    return res.status(400).json({ error: "refresh_token is required" });
  }

  try {
    await logoutUser(refresh_token);
  } catch (error) {
    res.status(401).json({ error: "Failed to logout", details: error.response?.data || error.message });
  }
};




exports.changePassword = async (req, res) => {
  try {
    const { id } = req.params;
    const payload = req.body;
    const { error } = changePasswordSchema.validate(payload, { abortEarly: false });

    if (error) {
      const errorMessages = error.details.reduce((acc, err) => {
        const key = err.path[0] || "general";
        acc[key] = err.message;
        return acc;
      }, {});
      
      return errorResponse(res, errorMessages, "Validation Error", 403);
    }

    await changePassword(id, payload, res);

  } catch (error) {
    return errorResponse(res, error.message, 'Error updating change password', 500);
  }
};


exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: "email is required" });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: "Invalid email format" });
    }

    await forgotPassword(email, res);

  } catch (error) {
    return errorResponse(res, error.message, 'Error updating task', 500);
  }
};

exports.verifyOtp = async (req, res) => {
  const { id, enteredOtp } = req.body;

  try {
    const query = "SELECT reset_token, reset_token_expiry FROM users WHERE id = ?";
    const [user] = await db.query(query, [id]);

    if (!user || user.length === 0) {
      return errorResponse(res, null, 'User not found', 404);
    }

    const currentUser = user[0];

    // Validate OTP
    if (currentUser.reset_token !== enteredOtp) {
      return errorResponse(res, null, 'Invalid OTP', 400);
    }

    // Check expiry
    if (new Date(currentUser.reset_token_expiry) < new Date()) {
      return errorResponse(res, null, 'OTP expired', 400);
    }

    return successResponse(res, null, 'OTP verified successfully.');
  } catch (error) {
    console.error("OTP verification failed:", error);
    return errorResponse(res, error.message, 'Error verifying OTP', 500);
  }
};




exports.reset_password = async (req, res) => {
  try {
    const { id, newPassword, confirmPassword } = req.body;

    if (!id || !newPassword || !confirmPassword) {
      return errorResponse(res, null, 'id, newPassword, and confirmPassword are required', 400);
    }

    if (newPassword !== confirmPassword) {
      return errorResponse(res, null, 'New password and confirm password do not match', 400);
    }

    await resetPasswordWithKeycloak(id, newPassword, res);

  } catch (error) {
    return errorResponse(res, error.message, 'Error resetting password', 500);
  }
};



