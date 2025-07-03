// server.js - Main Entry Point
// =============================================================================
// IMPORTS
// =============================================================================

const express = require('express');
const session = require('express-session');
const passport = require('passport');
require('dotenv').config();

// Import configurations
const { initializeDatabase } = require('./config/database');
const { setupMiddleware } = require('./config/middleware');
const { configurePassport } = require('./config/passport');

// Import route modules
const mainRoutes = require('./routes/main');
const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');
const adminRoutes = require('./routes/admin');

// =============================================================================
// APP INITIALIZATION
// =============================================================================

const app = express();
const PORT = process.env.PORT || 3000;

// =============================================================================
// DATABASE SETUP
// =============================================================================

// Initialize database and create tables
initializeDatabase();

// =============================================================================
// MIDDLEWARE SETUP
// =============================================================================

// Setup all middleware (sessions, body parsing, etc.)
setupMiddleware(app);

// =============================================================================
// PASSPORT CONFIGURATION
// =============================================================================

// Configure passport strategies and serialization
configurePassport(passport);

// Initialize passport middleware
app.use(passport.initialize());
app.use(passport.session());

// =============================================================================
// ROUTES SETUP
// =============================================================================

// Main application routes (/, /dashboard, /login)
app.use('/', mainRoutes);

// Authentication routes (/auth/google, /auth/facebook, /auth/quickbooks)
app.use('/auth', authRoutes);

// API routes (/api/customer/:id, etc.)
app.use('/api', apiRoutes);

// Admin routes (/admin, /admin/customer/:id)
app.use('/admin', adminRoutes);

// =============================================================================
// HEALTH CHECK & DEBUG ROUTES
// =============================================================================

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    time: new Date(),
    environment: process.env.QB_ENVIRONMENT || 'production',
    port: PORT
  });
});

app.get('/debug', (req, res) => {
  const protocol = req.header('x-forwarded-proto') || req.protocol;
  const host = req.header('x-forwarded-host') || req.get('host');

  res.json({
    message: "Server Debug Info",
    detectedProtocol: protocol,
    detectedHost: host,
    detectedCallback: `${protocol}://${host}/auth/google/callback`,
    hardcodedCallback: "https://auth.robosouthla.com/auth/google/callback",
    environment: process.env.QB_ENVIRONMENT || 'production',
    headers: {
      'x-forwarded-proto': req.header('x-forwarded-proto'),
      'x-forwarded-host': req.header('x-forwarded-host'),
      'host': req.get('host')
    }
  });
});

app.get('/debug-auth', (req, res) => {
  res.json({
    timestamp: new Date().toISOString(),
    sessionAuthenticated: req.session?.authenticated,
    passportAuthenticated: req.isAuthenticated?.(),
    hasUser: !!req.user,
    sessionUserInfo: req.session?.userInfo,
    passportUser: req.user ? {
      id: req.user.id,
      email: req.user.email,
      name: req.user.name
    } : null,
    sessionID: req.sessionID,
    userAgent: req.headers['user-agent']
  });
});

// =============================================================================
// ERROR HANDLING
// =============================================================================

// 404 handler
app.use((req, res) => {
  res.status(404).send(`
    <html>
    <head>
      <title>404 - Page Not Found</title>
      <style>
        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
        .container { background: white; padding: 40px; border-radius: 10px; max-width: 500px; margin: 0 auto; }
        .btn { background: #007bff; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🤖 404 - Page Not Found</h1>
        <p>The page you're looking for doesn't exist.</p>
        <a href="/" class="btn">Go to Portal Home</a>
      </div>
    </body>
    </html>
  `);
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('❌ Server Error:', err);
  
  res.status(500).json({
    error: 'internal_server_error',
    message: 'Something went wrong on the server',
    ...(process.env.NODE_ENV === 'development' && { details: err.message })
  });
});

// =============================================================================
// SERVER START
// =============================================================================

app.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 =============================================================================');
  console.log('🤖 AI Workflow Portal Server Started');
  console.log('🚀 =============================================================================');
  console.log(`📡 Server running on port: ${PORT}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📊 QuickBooks Environment: ${process.env.QB_ENVIRONMENT || 'production'}`);
  console.log(`🔗 Google Callback URL: https://auth.robosouthla.com/auth/google/callback`);
  console.log(`🔗 Facebook Callback URL: https://auth.robosouthla.com/auth/facebook/callback`);
  console.log(`🔗 QuickBooks Callback URL: https://auth.robosouthla.com/auth/quickbooks/callback`);
  console.log('🚀 =============================================================================');
  console.log('✅ All routes loaded:');
  console.log('   📄 Main Routes: /, /dashboard, /login, /logout');
  console.log('   🔐 Auth Routes: /auth/google, /auth/facebook, /auth/quickbooks');
  console.log('   🔌 API Routes: /api/customer/:id, /api/customers');
  console.log('   👥 Admin Routes: /admin, /admin/customer/:id');
  console.log('   🏥 Health: /health, /debug, /debug-auth');
  console.log('🚀 =============================================================================');
  console.log('🎉 Server ready to accept connections!');
  console.log('🚀 =============================================================================');
});

// =============================================================================
// GRACEFUL SHUTDOWN
// =============================================================================

process.on('SIGTERM', () => {
  console.log('📄 SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('📄 SIGINT received, shutting down gracefully...');
  process.exit(0);
});

// Export app for testing purposes
module.exports = app;