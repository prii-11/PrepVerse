const express = require('express');
const cors = require('cors');
const env = require('./config/env');
const rateLimiter = require('./middleware/rateLimit');
const errorHandler = require('./middleware/error');
const { NotFoundError } = require('./utils/errors');

const app = express();

// CORS allowlist driven by CLIENT_ORIGIN (comma-separated origins supported),
// never a wildcard.
const allowedOrigins = env.CLIENT_ORIGIN.split(',').map((origin) => origin.trim());
app.use(cors({ origin: allowedOrigins }));

// Parse incoming JSON request bodies.
app.use(express.json());

// General IP-based rate limiter — applies to all routes.
app.use(rateLimiter);

// Health check route.
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'prepverse-api' });
});

// Versioned API router. Empty for M2.1 — modules mount their own routers here
// starting M3.
const apiRouter = express.Router();
app.use('/api/v1', apiRouter);

// 404 handler — after every real route, before the error middleware. Uses the
// same typed error path as the rest of the app so the shape is consistent.
app.use((req, res, next) => {
  next(new NotFoundError('Route not found'));
});

// Error handler — mounted last, after every route.
app.use(errorHandler);

module.exports = app;
