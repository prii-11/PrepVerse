const app = require('./app');
const connectDB = require('./config/db');
const env = require('./config/env');

// Start the server only after MongoDB is connected (fail-fast pattern).
const startServer = async () => {
  await connectDB();

  app.listen(env.PORT, () => {
    console.log(`Server running on port ${env.PORT}`);
  });
};

startServer();
