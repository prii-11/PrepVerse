const express = require('express');
const { signup, login } = require('../controllers/authController');

const router = express.Router();

// Route for creating a new user account.
router.post('/signup', signup);

// Route for logging in an existing user.
router.post('/login', login);

module.exports = router;