const express = require('express');
const passport = require('passport');
const router = express.Router();
// Remove the problematic imports and define locally
const REQUIRED_SCOPES = [
  'profile',
  'email',
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/contacts.other.readonly',
  'https://www.googleapis.com/auth/contacts.readonly',
  'https://www.googleapis.com/auth/contacts',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.labels',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/drive'
];

// Google OAuth initiation
router.get('/google',
  passport.authenticate('google', {
    scope: REQUIRED_SCOPES,
    accessType: 'offline',
    prompt: 'consent'
  })
);

// Google OAuth callback
router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: '/auth-result?google_error=auth_failed' }),
  (req, res) => {
    res.redirect('/auth-result?google_success=1&customer_id=' + req.user.id);
  }
);

// Alternative Google callback route (from your login system)
router.get('/google/callback-alt',
  passport.authenticate('google', { failureRedirect: '/login?google_error=1' }),
  (req, res) => {
    console.log('✅ Google OAuth callback successful for:', req.user?.email);
    console.log('Customer ID:', req.user?.id);

    // CRITICAL: Set session authentication for consistency
    req.session.authenticated = true;
    req.session.userInfo = {
      email: req.user.email,
      name: req.user.name,
      role: 'google_user',
      customerId: req.user.id,
      authType: 'google'
    };

    // Force session save before redirect
    req.session.save((err) => {
      if (err) {
        console.error('❌ Session save error:', err);
        return res.redirect('/login?error=session_failed');
      }
      console.log('✅ Session saved successfully for Google user');
      res.redirect('/dashboard');
    });
  }
);

// Google disconnect route
router.post('/google/disconnect', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const customerId = req.user.id;
    console.log('Disconnecting Google for user:', req.user.email);

    // Remove Google tokens from database
    const stmt = require('../config/database').db.prepare(`
      UPDATE customers 
      SET google_access_token = NULL, 
          google_refresh_token = NULL, 
          scopes = NULL, 
          token_expiry = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    stmt.run([customerId], function (err) {
      if (err) {
        console.error('Error disconnecting Google:', err);
        return res.status(500).json({ error: 'Failed to disconnect' });
      }

      console.log('Google disconnected successfully for:', req.user.email);
      
      // Clear the user's Google data from the session/passport
      req.user.google_access_token = null;
      req.user.google_refresh_token = null;
      req.user.scopes = null;
      req.user.token_expiry = null;
      
      // Return JSON response for JavaScript to handle
      res.json({ success: true, message: 'Google disconnected successfully' });
    });

    stmt.finalize();

  } catch (error) {
    console.error('Disconnect error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;