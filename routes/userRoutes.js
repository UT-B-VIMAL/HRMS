const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');

router.post('/user', userController.createUser);
router.put('/user/:id', userController.updateUser);
router.delete('/user/:id', userController.deleteUser);
router.get('/user/:id', userController.getUser);
router.get('/user', userController.getAllUsers);

module.exports = router;
