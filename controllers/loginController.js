const { signInUser,logoutUser,changePassword } = require("../api/functions/keycloakFunction");
const { changePasswordSchema } = require("../validators/authValidator");
const { successResponse, errorResponse } = require('../helpers/responseHelper');

exports.login = async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required" });
    }

    try {
        const tokens = await signInUser(username, password);
        res.status(200).json({ message: "Login successful", tokens });
    } catch (error) {
        res.status(401).json({ error: "Failed to sign in", details: error.response?.data || error.message });
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
             acc[err.path[0]] = err.message;
             return acc;
           }, {});
   
           return errorResponse(res, errorMessages, "Validation Error", 403);
         }
   
         await changePassword(id, payload, res);
   
       } catch (error) {
         return errorResponse(res, error.message, 'Error updating task', 500);
       }
     };
   
   
