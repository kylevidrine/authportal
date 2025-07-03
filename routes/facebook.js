const express = require('express');
const passport = require('passport');
const FacebookStrategy = require('passport-facebook').Strategy;
const router = express.Router();

// Facebook Strategy configuration
function configureFacebookStrategy(getCustomerById, storeCustomer) {
  passport.use(new FacebookStrategy({
    clientID: process.env.FB_APP_ID,
    clientSecret: process.env.FB_APP_SECRET,
    callbackURL: process.env.FB_CALLBACK_URL,
    profileFields: ['id', 'emails', 'name', 'picture.type(large)']
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      const email = profile.emails?.[0]?.value || `fb_${profile.id}@facebook.com`;
      const userId = `fb_${profile.id}`;

      const customerData = {
        id: userId,
        email,
        name: `${profile.name.givenName} ${profile.name.familyName}`,
        picture: profile.photos?.[0]?.value,
        accessToken,
        refreshToken,
        scopes: 'facebook'
      };

      await storeCustomer(customerData);
      return done(null, customerData);
    } catch (err) {
      console.error('❌ Facebook OAuth error:', err);
      return done(err, null);
    }
  }));
}

// Facebook authentication initiation
router.get('/auth/facebook', passport.authenticate('facebook', { scope: ['email'] }));

// Facebook authentication callback
router.get('/auth/facebook/callback',
  passport.authenticate('facebook', { failureRedirect: '/login?fb_error=1' }),
  (req, res) => {
    req.session.authenticated = true;
    req.session.userInfo = {
      email: req.user.email,
      name: req.user.name,
      role: 'facebook_user',
      customerId: req.user.id,
      authType: 'facebook'
    };
    req.session.save(() => res.redirect('/dashboard'));
  }
);

// Facebook disconnect route
router.post('/auth/facebook/disconnect', async (req, res) => {
  try {
    if (!req.session?.authenticated || !req.session?.userInfo || req.session.userInfo.authType !== 'facebook') {
      return res.status(401).json({ error: 'Not authenticated with Facebook' });
    }

    const customerId = req.session.userInfo.customerId;
    console.log('Disconnecting Facebook for user:', req.session.userInfo.email);

    // Get database instance from app locals (we'll set this up)
    const db = req.app.locals.db;

    // Remove the customer record completely for Facebook users
    // since they don't have Google integration to preserve
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM customers WHERE id = ?', [customerId], function (err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });

    console.log('Facebook customer record deleted:', req.session.userInfo.email);

    // Destroy session
    req.session.destroy((err) => {
      if (err) {
        console.error('Error destroying session:', err);
        return res.status(500).json({ error: 'Failed to disconnect' });
      }
      
      console.log('Facebook disconnected successfully');
      res.json({ success: true, message: 'Facebook disconnected successfully' });
    });

  } catch (error) {
    console.error('Facebook disconnect error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Facebook API status route
router.get('/api/customer/:id/facebook/status', async (req, res) => {
  try {
    // Get database helper function from app locals
    const getCustomerById = req.app.locals.getCustomerById;
    const customer = await getCustomerById(req.params.id);

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Check if this is a Facebook user by looking at the ID pattern or email
    const isFacebookUser = customer.id.startsWith('fb_') || customer.email.includes('@facebook.com');

    res.json({
      integration: 'facebook',
      connected: isFacebookUser,
      customerType: isFacebookUser ? 'facebook' : 'other',
      email: customer.email,
      name: customer.name,
      authUrl: `${process.env.BASE_URL}/auth/facebook`
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = {
  router,
  configureFacebookStrategy
};