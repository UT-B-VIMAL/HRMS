const express = require('express');
const router = express.Router();
const subtaskController = require('../controllers/subtaskcontroller');

router.post('/subtask', subtaskController.createSubTask);   
router.put('/subtask/:id', subtaskController.updateSubTask);     
router.delete('/subtask/:id', subtaskController.deleteSubTask);
router.get('/subtask/:id', subtaskController.getSubTask);   
router.get('/subtask', subtaskController.getAllSubTasks); 

module.exports = router;
