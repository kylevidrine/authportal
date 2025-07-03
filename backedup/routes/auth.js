// ========================================
// FILE: routes/auth.js
// ========================================

const express = require('express');
const passport = require('passport');
const OAuthClient = require('intuit-oauth');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { 
  storeCustomer, 
  getCustomerById, 
  getAllCustomers, 
  updateCustomerQBTokens 
} = require('../utils/database');

const router = express.Router();

// QB Configuration
const QB_SCOPES = [OAuthClient.scopes.Accounting];
const QB_ENVIRONMENT = process.env.QB_ENVIRONMENT || 'production';

const qbOAuthClient = new OAuthClient({
  clientId: QB_ENVIRONMENT === 'production'
    ? process.env.QB_CLIENT_ID_PROD
    : process.env.QB_CLIENT_ID_SANDBOX,
  clientSecret: QB_ENVIRONMENT === 'production'
    ? process.env.QB_CLIENT_SECRET_PROD
    : process.env.QB_CLIENT_SECRET_SANDBOX,
  environment: QB_ENVIRONMENT,
  redirectUri: 'https://auth.robosouthla.com/auth/quickbooks/callback'
});

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

// Google OAuth routes
router.get('/google',
  passport.authenticate('google', {
    scope: REQUIRED_SCOPES,
    accessType: 'offline',
    prompt: 'consent'
  })
);

router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: '/auth-result?google_error=auth_failed' }),
  (req, res) => {
    res.redirect('/auth-result?google_success=1&customer_id=' + req.user.id);
  }
);

// QuickBooks OAuth routes
router.get('/quickbooks', (req, res) => {
  // Check for existing authentication
  if (req.isAuthenticated?.() && req.user) {
    // Google OAuth user
    req.session.customerId = req.user.id;
    console.log('🔗 Google OAuth user connecting QuickBooks:', req.user.email);
  } else if (req.session?.authenticated && req.session?.userInfo) {
    // Basic auth user - don't set customerId yet, let callback handle it
    console.log('🔗 Basic auth user connecting QuickBooks:', req.session.userInfo.email);
  } else {
    return res.redirect('/?error=login_required');
  }

  const authUri = qbOAuthClient.authorizeUri({
    scope: QB_SCOPES,
    state: crypto.randomBytes(16).toString('hex')
  });

  res.redirect(authUri);
});

// NEW: Standalone QuickBooks auth route (doesn't require Google auth)
router.get('/quickbooks/standalone', (req, res) => {
  // Check if user is already authenticated
  if (req.isAuthenticated?.() && req.user) {
    // Redirect to regular QB auth for Google users
    return res.redirect('/auth/quickbooks');
  } else if (req.session?.authenticated && req.session?.userInfo) {
    // Redirect to regular QB auth for basic auth users
    return res.redirect('/auth/quickbooks');
  } else {
    // True standalone auth - create temp ID
    const tempId = uuidv4();
    req.session.tempQBAuthId = tempId;
    console.log('🔗 Starting standalone QuickBooks auth with temp ID:', tempId);
  }

  const authUri = qbOAuthClient.authorizeUri({
    scope: QB_SCOPES,
    state: crypto.randomBytes(16).toString('hex')
  });

  res.redirect(authUri);
});

router.get('/quickbooks/callback', async (req, res) => {
  try {
    if (req.query.error) {
      console.error('QuickBooks OAuth error:', req.query.error);
      return res.redirect('/auth-result?qb_error=auth_failed');
    }

    const authResponse = await qbOAuthClient.createToken(req.url);
    const token = authResponse.getToken();

    console.log('QuickBooks auth successful:', {
      companyId: req.query.realmId,
      hasTokens: !!token.access_token
    });

    const tokenExpiry = new Date(Date.now() + (token.expires_in * 1000));
    const baseUrl = QB_ENVIRONMENT === 'sandbox'
      ? 'https://sandbox-quickbooks.api.intuit.com'
      : 'https://quickbooks.api.intuit.com';

    let customerId;
    let isNewCustomer = false;

    // PRIORITY ORDER FOR DETERMINING CUSTOMER:
    // 1. Already authenticated Google OAuth user
    // 2. Already authenticated basic auth user 
    // 3. Session-stored customer ID
    // 4. Create new customer (standalone QB auth)

    if (req.isAuthenticated?.() && req.user && req.user.id) {
      // Case 1: Existing Google OAuth user adding QuickBooks
      customerId = req.user.id;
      console.log('🔗 Adding QuickBooks to existing Google OAuth customer:', customerId, req.user.email);
    }
    else if (req.session?.authenticated && req.session?.userInfo?.email) {
      // Case 2: Basic auth user adding QuickBooks
      const basicAuthEmail = req.session.userInfo.email;
      console.log('🔗 Basic auth user connecting QuickBooks:', basicAuthEmail);

      // Check if this basic auth user already has a customer record
      const existingCustomers = await getAllCustomers();
      const existingCustomer = existingCustomers.find(c => c.email === basicAuthEmail);

      if (existingCustomer) {
        // Use existing customer record
        customerId = existingCustomer.id;
        console.log('✅ Found existing customer record for basic auth user:', customerId);
      } else {
        // Create new customer record for basic auth user
        customerId = uuidv4();
        isNewCustomer = true;

        await storeCustomer({
          id: customerId,
          email: basicAuthEmail,
          name: req.session.userInfo.name,
          picture: null,
          accessToken: null, // No Google tokens for basic auth
          refreshToken: null,
          scopes: null,
          tokenExpiry: null,
          qbAccessToken: token.access_token,
          qbRefreshToken: token.refresh_token,
          qbCompanyId: req.query.realmId,
          qbTokenExpiry: tokenExpiry,
          qbBaseUrl: baseUrl
        });

        console.log('✅ Created new customer record for basic auth user:', customerId, basicAuthEmail);
      }
    }
    else if (req.session?.customerId) {
      // Case 3: Session-stored customer ID (fallback)
      customerId = req.session.customerId;
      console.log('🔗 Using session-stored customer ID:', customerId);
    }
    else if (req.session?.tempQBAuthId) {
      // Case 4: Standalone QuickBooks auth (no existing authentication)
      customerId = uuidv4();
      isNewCustomer = true;

      await storeCustomer({
        id: customerId,
        email: `qb-user-${req.query.realmId}@temp.local`, // Temporary email
        name: `QuickBooks User ${req.query.realmId}`,
        picture: null,
        accessToken: null,
        refreshToken: null,
        scopes: null,
        tokenExpiry: null,
        qbAccessToken: token.access_token,
        qbRefreshToken: token.refresh_token,
        qbCompanyId: req.query.realmId,
        qbTokenExpiry: tokenExpiry,
        qbBaseUrl: baseUrl
      });

      console.log('✅ Created new QB-only customer:', customerId);
      delete req.session.tempQBAuthId;
    }
    else {
      // No valid session - redirect to start over
      console.log('❌ No valid session found for QuickBooks callback');
      return res.redirect('/auth-result?qb_error=session_lost');
    }

    // Update or add QuickBooks tokens for the customer
    if (!isNewCustomer) {
      await updateCustomerQBTokens(customerId, {
        qbAccessToken: token.access_token,
        qbRefreshToken: token.refresh_token,
        qbCompanyId: req.query.realmId,
        qbTokenExpiry: tokenExpiry,
        qbBaseUrl: baseUrl
      });
    }

    console.log('🎉 QuickBooks successfully connected for customer:', customerId);

    // Redirect to dashboard instead of auth-result for authenticated users
    if (req.session?.authenticated || req.isAuthenticated?.()) {
      res.redirect('/dashboard?qb_success=1');
    } else {
      res.redirect(`/auth-result?qb_success=1&customer_id=${customerId}`);
    }

  } catch (error) {
    console.error('❌ QuickBooks callback error:', error);
    res.redirect('/auth-result?qb_error=token_save_failed');
  }
});

router.post('/quickbooks/disconnect', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    await updateCustomerQBTokens(req.user.id, {
      qbAccessToken: null,
      qbRefreshToken: null,
      qbCompanyId: null,
      qbTokenExpiry: null,
      qbBaseUrl: null
    });

    res.json({ success: true, message: 'QuickBooks disconnected' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to disconnect QuickBooks' });
  }
});

router.get('/quickbooks/disconnect', async (req, res) => {
  try {
    const realmId = req.query.realmId;

    if (realmId) {
      const customers = await getAllCustomers();
      const customer = customers.find(c => c.qb_company_id === realmId);

      if (customer) {
        await updateCustomerQBTokens(customer.id, {
          qbAccessToken: null,
          qbRefreshToken: null,
          qbCompanyId: null,
          qbTokenExpiry: null,
          qbBaseUrl: null
        });

        console.log(`QuickBooks disconnected for customer: ${customer.id} (Company: ${realmId})`);
      }
    }

    res.send(`
      <html>
      <head>
        <title>QuickBooks Disconnected</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
          .container { background: white; padding: 40px; border-radius: 10px; max-width: 500px; margin: 0 auto; }
          .btn { background: #007bff; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>📊 QuickBooks Disconnected</h1>
          <p>Your QuickBooks integration has been successfully disconnected.</p>
          <p>You can reconnect at any time through your dashboard.</p>
          <a href="/dashboard" class="btn">Go to Dashboard</a>
        </div>
      </body>
      </html>
    `);

  } catch (error) {
    console.error('QuickBooks disconnect error:', error);
    res.redirect('/dashboard?qb_error=disconnect_failed');
  }
});

// Google disconnect route
router.post('/google/disconnect', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const customerId = req.user.id;
    console.log('Disconnecting Google for user:', req.user.email);

    const { db } = require('../config/database');

    // Remove Google tokens from database
    const stmt = db.prepare(`
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

// Facebook routes
router.get('/facebook', passport.authenticate('facebook', { scope: ['email'] }));

router.get('/facebook/callback',
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

router.post('/facebook/disconnect', async (req, res) => {
  try {
    if (!req.session?.authenticated || !req.session?.userInfo || req.session.userInfo.authType !== 'facebook') {
      return res.status(401).json({ error: 'Not authenticated with Facebook' });
    }

    const customerId = req.session.userInfo.customerId;
    console.log('Disconnecting Facebook for user:', req.session.userInfo.email);

    const { db } = require('../config/database');

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

// Auth result page
router.get('/auth-result', async (req, res) => {
  const urlParams = new URL(req.url, `http://${req.get('host')}`);
  const qbSuccess = urlParams.searchParams.get('qb_success');
  const qbError = urlParams.searchParams.get('qb_error');
  const googleSuccess = urlParams.searchParams.get('google_success');
  const customerId = urlParams.searchParams.get('customer_id');

  let customer = null;
  if (customerId) {
    try {
      customer = await getCustomerById(customerId);
    } catch (error) {
      console.error('Error fetching customer:', error);
    }
  }

  let statusMessage = '';
  let nextSteps = '';

  if (qbSuccess && customer) {
    statusMessage = `
      <div style="background: #d4edda; color: #155724; padding: 20px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #28a745;">
        <h3 style="margin-top: 0;">✅ QuickBooks Connected Successfully!</h3>
        <p>Company ID: <code>${customer.qb_company_id}</code></p>
        <p>Environment: <code>${QB_ENVIRONMENT}</code></p>
      </div>
    `;

    const hasGoogle = !!customer.google_access_token;

    nextSteps = `
      <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h4>🚀 Next Steps:</h4>
        <div style="background: white; padding: 15px; border-radius: 6px; margin: 10px 0;">
          <strong>Your Customer ID:</strong> 
          <span style="background: #f0f0f0; padding: 8px 12px; border-radius: 4px; font-family: monospace; font-size: 14px;">${customerId}</span>
          <button onclick="copyToClipboard('${customerId}')" style="margin-left: 10px; padding: 6px 12px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">Copy</button>
        </div>
        
        ${!hasGoogle ? `
          <div style="background: #e3f2fd; padding: 15px; border-radius: 6px; margin: 10px 0; border-left: 4px solid #2196f3;">
            <strong>💡 Enhance Your Integration:</strong>
            <p>Add Google Workspace for even more powerful workflows!</p>
            <a href="/auth/google" style="background: #4285f4; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; display: inline-block;">
              Connect Google Workspace
            </a>
          </div>
        ` : `
          <div style="background: #e8f5e8; padding: 15px; border-radius: 6px; margin: 10px 0; border-left: 4px solid #28a745;">
            <strong>🎉 Fully Integrated!</strong>
            <p>You now have both Google Workspace and QuickBooks connected!</p>
          </div>
        `}
      </div>
    `;
  } else if (googleSuccess && customer) {
    statusMessage = `
      <div style="background: #d4edda; color: #155724; padding: 20px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #28a745;">
        <h3 style="margin-top: 0;">✅ Google Workspace Connected Successfully!</h3>
        <p>Email: <code>${customer.email}</code></p>
      </div>
    `;

    const hasQB = !!(customer.qb_access_token && customer.qb_company_id);

    nextSteps = `
      <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h4>🚀 Next Steps:</h4>
        <div style="background: white; padding: 15px; border-radius: 6px; margin: 10px 0;">
          <strong>Your Customer ID:</strong> 
          <span style="background: #f0f0f0; padding: 8px 12px; border-radius: 4px; font-family: monospace; font-size: 14px;">${customerId}</span>
          <button onclick="copyToClipboard('${customerId}')" style="margin-left: 10px; padding: 6px 12px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">Copy</button>
        </div>
        
        ${!hasQB ? `
          <div style="background: #fff3cd; padding: 15px; border-radius: 6px; margin: 10px 0; border-left: 4px solid #ffc107;">
            <strong>💡 Add QuickBooks Integration:</strong>
            <p>Connect your accounting data for comprehensive business workflows!</p>
            <a href="/auth/quickbooks/standalone" style="background: #0077C5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; display: inline-block;">
              Connect QuickBooks
            </a>
          </div>
        ` : `
          <div style="background: #e8f5e8; padding: 15px; border-radius: 6px; margin: 10px 0; border-left: 4px solid #28a745;">
            <strong>🎉 Fully Integrated!</strong>
            <p>You now have both Google Workspace and QuickBooks connected!</p>
          </div>
        `}
      </div>
    `;
  } else {
    const errorMessages = {
      'auth_failed': 'Authorization failed. Please try again.',
      'session_lost': 'Session expired. Please start the authorization process again.',
      'token_save_failed': 'Failed to save authorization tokens. Please try again.'
    };
    statusMessage = `
      <div style="background: #f8d7da; color: #721c24; padding: 20px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #dc3545;">
        <h3 style="margin-top: 0;">❌ Authorization Error</h3>
        <p>${errorMessages[qbError] || 'Unknown error occurred'}</p>
      </div>
    `;

    nextSteps = `
      <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h4>🔄 Try Again:</h4>
        <a href="/" style="background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 5px;">
          Start Over
        </a>
      </div>
    `;
  }

  res.send(`
    <html>
    <head>
      <title>Authorization Result</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5; }
        .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; }
        .btn { background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 5px; }
        h1 { color: #333; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🤖 AI Workflow Portal</h1>
        
        ${statusMessage}
        ${nextSteps}
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6;">
          <a href="/" class="btn">← Back to Portal</a>
          <a href="/admin" class="btn" style="background: #6c757d;">Admin Panel</a>
        </div>
      </div>
      
      <script>
        function copyToClipboard(text) {
          navigator.clipboard.writeText(text).then(() => {
            alert('Customer ID copied to clipboard!');
          }).catch(err => {
            console.error('Failed to copy:', err);
            const textArea = document.createElement('textarea');
            textArea.value = text;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            alert('Customer ID copied to clipboard!');
          });
        }
      </script>
    </body>
    </html>
  `);
});

module.exports = router;