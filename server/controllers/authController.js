const bcrypt = require('bcryptjs');
const User = require('../models/User');
const jwt = require('jsonwebtoken');
// Creates a new user account after validating input and hashing the password.
const signup = async (req, res) => {
  try {
    const { firstName, lastName, email, password } = req.body;

    // Validate required fields before any database work.
    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'firstName, lastName, email, and password are required',
      });
    }
    
    const normalizedEmail = email.trim().toLowerCase();

    // Prevent duplicate account creation for the same email.
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists',
      });
    }

    // Hash password before storing it in MongoDB.
    const hashedPassword = await bcrypt.hash(password, 10);

    await User.create({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: normalizedEmail,
      password: hashedPassword,
    });

    return res.status(201).json({
      success: true,
      message: 'User created successfully',
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Authenticates an existing user with email and password.
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate required login fields before querying the database.
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'email and password are required',
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }
     // Generate JWT token after successful authentication.
const token = jwt.sign(
  {
    id: user._id,
  },
  process.env.JWT_SECRET,
  {
    expiresIn: '7d',
  }
);
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    return res.status(200).json({
  success: true,
  message: 'Login successful',
  token,
  user: {
    id: user._id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
  },
});
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

module.exports = {
  signup,
  login,
};
