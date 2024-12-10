const { createTask, updateTask, deleteTask, getTask, getAllTasks,addTaskComment } = require('../api/functions/taskFunction');
const { successResponse, errorResponse } = require('../helpers/responseHelper');
const { createTaskSchema, updateTaskSchema } = require("../validators/taskValidator");

const taskController = {
  createTask: async (req, res) => {
    try {
      const payload = req.body;
      const { error } = createTaskSchema.validate(payload, { abortEarly: false });

      if (error) {
        const errorMessages = error.details.reduce((acc, err) => {
          acc[err.path[0]] = err.message;
          return acc;
        }, {});

        return errorResponse(res, errorMessages, "Validation Error", 403);
      }

      await createTask(payload, res);

    } catch (error) {
      console.error('Error creating task:', error.message);
      return errorResponse(res, error.message, 'Error creating task', 500);
    }
  },

  updateTask: async (req, res) => {
    try {
      const { id } = req.params;
      const payload = req.body;
      const { error } = updateTaskSchema.validate(payload, { abortEarly: false });

      if (error) {
        const errorMessages = error.details.reduce((acc, err) => {
          acc[err.path[0]] = err.message;
          return acc;
        }, {});

        return errorResponse(res, errorMessages, "Validation Error", 403);
      }

      await updateTask(id, payload, res);

    } catch (error) {
      return errorResponse(res, error.message, 'Error updating task', 500);
    }
  },

  deleteTask: async (req, res) => {
    try {
      const { id } = req.params;
      await deleteTask(id, res);

    } catch (error) {
      return errorResponse(res, error.message, 'Error deleting task', 500);
    }
  },

  getTask: async (req, res) => {
    try {
      const { id } = req.params;
      await getTask(id, res);

    } catch (error) {
      return errorResponse(res, error.message, 'Error fetching task', 500);
    }
  },

  getAllTasks: async (req, res) => {
    try {
      await getAllTasks(res);

    } catch (error) {
      return errorResponse(res, error.message, 'Error retrieving tasks', 500);
    }
  },
  

  taskComments: async (req, res) => {
    try {
      const payload = req.body;
      await addTaskComment(payload, res);
    } catch (error) {
      return errorResponse(res, error.message, 'Error retrieving task comments', 500);
    }
  }

};



module.exports = taskController;

