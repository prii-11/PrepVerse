const mongoose = require('mongoose');

// Connects the server to MongoDB using the runtime environment variable.
const connectDB = async () => {
	try {
		await mongoose.connect(process.env.MONGO_URI);
		console.log('MongoDB connected successfully');
	} catch (error) {
		// Fail fast so the server does not start without a database connection.
		console.error(`MongoDB connection failed: ${error.message}`);
		process.exit(1);
	}
};

module.exports = connectDB;
module.exports.connectDB = connectDB;
