const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');

// Load environment variables before reading PORT or MONGO_URI.
dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;

// Allow the frontend and future clients to communicate with this API.
app.use(cors());

// Parse incoming JSON request bodies.
app.use(express.json());

app.use('/api/auth', authRoutes);

// Basic health check route for the backend.
app.get('/', (req, res) => {
	res.send('PrepVerse Backend Running');
});

// Start the server only after MongoDB is connected.
const startServer = async () => {
	await connectDB();

	app.listen(PORT, () => {
		console.log(`Server running on port ${PORT}`);
	});
};

startServer();
