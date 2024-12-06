const { createSubTask, updateSubTask, deleteSubTask, getSubTask,getAllSubTasks } = require('../api/subtask/subtaskService');
const { successResponse, errorResponse } = require('../helpers/responseHelper');

const { createSubTaskSchema ,updateSubTaskSchema } = require("../validators/subtaskValidator");


exports.createSubTask = async (req, res) => {
    try {
        const payload = req.body;
        const { error } = createSubTaskSchema.validate(payload, { abortEarly: false });

        if (error) {
            const errorMessages = error.details.reduce((acc, err) => {
                acc[err.path[0]] = err.message;
                return acc;
            }, {});

            return errorResponse(res, errorMessages, "Validation Error", 403);
        }

        await createSubTask(payload, res);

    } catch (error) {
        console.error('Error creating task:', error.message);
        return errorResponse(res, error.message, 'Error creating task', 500);
    }
};

exports.updateSubTask = async (req, res) => {
    try {
        const { id } = req.params;
        const payload = req.body;
        const { error } = updateSubTaskSchema.validate(payload, { abortEarly: false });
        if (error) {
            const errorMessages = error.details.reduce((acc, err) => {
                acc[err.path[0]] = err.message;
                return acc;
            }, {});

            return errorResponse(res, errorMessages, "Validation Error", 403);
        }

        await updateSubTask(id, payload, res);
    } catch (error) {
        return errorResponse(res, error.message, 'Error updating task', 500);
    }
};

exports.deleteSubTask = async (req, res) => {
    try {
        const { id } = req.params;
        await deleteSubTask(id, res);
    } catch (error) {
        return errorResponse(res, error.message, 'Error deleting task', 500);
    }
};

exports.getSubTask = async (req, res) => {
    try {
        const { id } = req.params;
        await getSubTask(id, res);
    } catch (error) {
        return errorResponse(res, error.message, 'Error fetching task', 500);
    }
};

exports.getAllSubTasks = async (req, res) => {
    try {
        await getAllSubTasks(res);
    } catch (error) {
        return errorResponse(res, error.message, 'Error retrieving tasks', 500);
    }
};
