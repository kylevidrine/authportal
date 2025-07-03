// routes/utils.js
const express = require('express');
const router = express.Router();

module.exports = (dependencies) => {
  const { 
    REQUIRED_SCOPES,
    QB_ENVIRONMENT
  } = dependencies;

  // =============================================================================
  // UTILITY ROUTES
  // =============================================================================

  // Health check endpoint
  router.get('/health', (req, res) => {
    res.json({ 
      status: 'ok', 
      time: new Date(), 
      scopes: REQUIRED_SCOPES 
    });
  });

  // System debug information
  router.get('/debug', (req, res) => {
    const protocol = req.header('x-forwarded-proto') || req.protocol;
    const host = req.header('x-forwarded-host') || req.get('host');

    res.json({
      message: "Callback URL Debug",
      detectedProtocol: protocol,
      detectedHost: host,
      detectedCallback: `${protocol}://${host}/auth/google/callback`,
      hardcodedCallback: "https://auth.robosouthla.com/auth/google/callback",
      clientId: process.env.GOOGLE_CLIENT_ID,
      requiredScopes: REQUIRED_SCOPES,

      // QuickBooks debug info
      quickbooks: {
        environment: QB_ENVIRONMENT,
        envFromFile: process.env.QB_ENVIRONMENT,
        clientIdProd: process.env.QB_CLIENT_ID_PROD?.substring(0, 10) + '...',
        clientIdSandbox: process.env.QB_CLIENT_ID_SANDBOX?.substring(0, 10) + '...',
        usingDefault: !process.env.QB_ENVIRONMENT
      },

      headers: {
        'x-forwarded-proto': req.header('x-forwarded-proto'),
        'x-forwarded-host': req.header('x-forwarded-host'),
        'host': req.get('host')
      }
    });
  });

  // Authentication debug information
  router.get('/debug-auth', (req, res) => {
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
      cookies: req.headers.cookie,
      userAgent: req.headers['user-agent']
    });
  });

  return router;
};