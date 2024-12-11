const { 
  createUser, 
  updateUser, 
  deleteUser, 
  getUser, 
  getAllUsers 
} = require('../api/functions/userFunction');

const { 
  successResponse, 
  errorResponse 
} = require('../helpers/responseHelper');

const UserSchema = require("../validators/userValidator");

exports.createUser = async (req, res) => {
  try {
      const payload = req.body;
      const { error } = UserSchema.validate(payload, { abortEarly: false });

      if (error) {
          const errorMessages = error.details.reduce((acc, err) => {
              acc[err.path[0]] = err.message;
              return acc;
          }, {});

          return errorResponse(res, errorMessages, "Validation Error", 403);
      }

      await createUser(payload, res);
  } catch (error) {
      console.error('Error creating user:', error.message);
      return errorResponse(res, error.message, 'Error creating user', 500);
  }
};

exports.updateUser = async (req, res) => {
  try {
      const { id } = req.params;
      const payload = req.body;
      const { error } = UserSchema.validate(payload, { abortEarly: false });

      if (error) {
          const errorMessages = error.details.reduce((acc, err) => {
              acc[err.path[0]] = err.message;
              return acc;
          }, {});

          return errorResponse(res, errorMessages, "Validation Error", 403);
      }

      await updateUser(id, payload, res);
  } catch (error) {
      return errorResponse(res, error.message, 'Error updating user', 500);
  }
};

exports.deleteUser = async (req, res) => {
  try {
      const { id } = req.params;
      await deleteUser(id, res);
  } catch (error) {
      return errorResponse(res, error.message, 'Error deleting user', 500);
  }
};

exports.getUser = async (req, res) => {
  try {
      const { id } = req.params;
      await getUser(id, res);
  } catch (error) {
      return errorResponse(res, error.message, 'Error fetching user', 500);
  }
};

exports.getAllUsers = async (req, res) => {
  try {
      await getAllUsers(req,res);
  } catch (error) {
      return errorResponse(res, error.message, 'Error retrieving users', 500);
  }
};

