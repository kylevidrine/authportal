const express = require('express');
const passport = require('passport');
const TikTokStrategy = require('passport-tiktok').Strategy;
const router = express.Router();

// TikTok Strategy configuration
function configureTikTokStrategy(getCustomerById, storeCustomer) {
  passport.use(new TikTokStrategy({
    clientID: process.env.TIKTOK_CLIENT_ID,
    clientSecret: process.env.TIKTOK_CLIENT_SECRET,
    callbackURL: process.env.TIKTOK_CALLBACK_URL,
    scope: ['user.info.basic', 'user.info.profile', 'user.info.stats']
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      const email = profile.emails?.[0]?.value || `tiktok_${profile.id}@tiktok.com`;
      const userId = `tiktok_${profile.id}`;

      const customerData = {
        id: userId,
        email,
        name: profile.displayName || `${profile.username}`,
        picture: profile.photos?.[0]?.value,
        accessToken,
        refreshToken,
        scopes: 'tiktok'
      };

      await storeCustomer(customerData);
      return done(null, customerData);
    } catch (err) {
      console.error('❌ TikTok OAuth error:', err);
      return done(err, null);
    }
  }));
}

// TikTok authentication initiation
router.get('/auth/tiktok', passport.authenticate('tiktok', { scope: ['user.info.basic', 'user.info.profile'] }));

// TikTok authentication callback
router.get('/auth/tiktok/callback',
  passport.authenticate('tiktok', { failureRedirect: '/login?tiktok_error=1' }),
  (req, res) => {
    req.session.authenticated = true;
    req.session.userInfo = {
      email: req.user.email,
      name: req.user.name,
      role: 'tiktok_user',
      customerId: req.user.id,
      authType: 'tiktok'
    };
    req.session.save(() => res.redirect('/dashboard'));
  }
);

// TikTok disconnect route
router.post('/auth/tiktok/disconnect', async (req, res) => {
  try {
    if (!req.session?.authenticated || !req.session?.userInfo || req.session.userInfo.authType !== 'tiktok') {
      return res.status(401).json({ error: 'Not authenticated with TikTok' });
    }

    const customerId = req.session.userInfo.customerId;
    console.log('Disconnecting TikTok for user:', req.session.userInfo.email);

    const db = req.app.locals.db;

    // Remove the customer record completely for TikTok users
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM customers WHERE id = ?', [customerId], function (err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });

    console.log('TikTok customer record deleted:', req.session.userInfo.email);

    // Destroy session
    req.session.destroy((err) => {
      if (err) {
        console.error('Error destroying session:', err);
        return res.status(500).json({ error: 'Failed to disconnect' });
      }
      
      console.log('TikTok disconnected successfully');
      res.json({ success: true, message: 'TikTok disconnected successfully' });
    });

  } catch (error) {
    console.error('TikTok disconnect error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// TikTok API status route
router.get('/api/customer/:id/tiktok/status', async (req, res) => {
  try {
    const getCustomerById = req.app.locals.getCustomerById;
    const customer = await getCustomerById(req.params.id);

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Check if this is a TikTok user by looking at the ID pattern or email
    const isTikTokUser = customer.id.startsWith('tiktok_') || customer.email.includes('@tiktok.com');

    res.json({
      integration: 'tiktok',
      connected: isTikTokUser,
      customerType: isTikTokUser ? 'tiktok' : 'other',
      email: customer.email,
      name: customer.name,
      authUrl: `${process.env.BASE_URL}/auth/tiktok`
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = {
  router,
  configureTikTokStrategy
}; 