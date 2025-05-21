const { signInUser, logoutUser, changePassword, forgotPassword,resetPasswordWithKeycloak } = require("../api/functions/keycloakFunction");
const { changePasswordSchema } = require("../validators/authValidator");
const { successResponse, errorResponse } = require('../helpers/responseHelper');

exports.login = async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }

  try {
    const tokens = await signInUser(username, password);
    // const tokens =" await signInUser(username, password)";
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


exports.reset_password = async (req, res) => {
  try {
    const { token,id,newPassword } = req.body;
    
    if (!id) {
      return res.status(400).json({ error: "id is required" });
    }
    await resetPasswordWithKeycloak( token, id, newPassword, res);

  } catch (error) {
    return errorResponse(res, error.message, 'Error updating task', 500);
  }
};


