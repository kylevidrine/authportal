// routes/google.js
const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');

module.exports = (dependencies) => {
 const { 
   getAllCustomers,
   getCustomerById,
   storeCustomer,
   updateCustomerGoogleTokens,
   validateToken,
   REQUIRED_SCOPES,
   passport,
   db
 } = dependencies;

 // =============================================================================
 // GOOGLE AUTHENTICATION ROUTES
 // =============================================================================

 // Start Google OAuth
 router.get('/auth/google',
   passport.authenticate('google', {
     scope: REQUIRED_SCOPES,
     accessType: 'offline',
     prompt: 'consent'
   })
 );

 // Google OAuth callback
 router.get('/auth/google/callback',
   passport.authenticate('google', { failureRedirect: '/login?google_error=1' }),
   (req, res) => {
     console.log('✅ Google OAuth callback successful for:', req.user?.email);
     console.log('Customer ID:', req.user?.id);

     req.session.authenticated = true;
     req.session.userInfo = {
       email: req.user.email,
       name: req.user.name,
       role: 'google_user',
       customerId: req.user.id,
       authType: 'google'
     };

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

 // Disconnect Google
 router.post('/auth/google/disconnect', async (req, res) => {
   try {
     if (!req.isAuthenticated()) {
       return res.status(401).json({ error: 'Not authenticated' });
     }

     const customerId = req.user.id;
     console.log('Disconnecting Google for user:', req.user.email);

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
       
       req.user.google_access_token = null;
       req.user.google_refresh_token = null;
       req.user.scopes = null;
       req.user.token_expiry = null;
       
       res.json({ success: true, message: 'Google disconnected successfully' });
     });

     stmt.finalize();

   } catch (error) {
     console.error('Disconnect error:', error);
     res.status(500).json({ error: 'Server error' });
   }
 });

 // =============================================================================
 // GOOGLE API ROUTES
 // =============================================================================

 // Get customer Google data
 router.get('/api/customer/:id', async (req, res) => {
   try {
     console.log('API call for customer:', req.params.id);
     const customer = await getCustomerById(req.params.id);

     if (!customer) {
       console.log('Customer not found:', req.params.id);
       return res.status(404).json({
         error: 'customer_not_found',
         message: 'Customer not found. Please authenticate first.',
         authUrl: `${process.env.BASE_URL}/auth/google`
       });
     }

     if (!customer.google_access_token) {
       console.log('No Google token found for:', customer.email);
       return res.status(403).json({
         error: 'no_google_token',
         message: 'No Google access token found. Please re-authenticate with Google.',
         authUrl: `${process.env.BASE_URL}/auth/google`
       });
     }

     console.log('Customer found, validating Google token for:', customer.email);
     const tokenValidation = await validateToken(customer.google_access_token);

     if (!tokenValidation.valid) {
       console.log('Google token validation failed for:', customer.email);
       return res.status(403).json({
         error: 'invalid_google_token',
         message: 'Google access token is invalid or expired. Please re-authenticate with Google.',
         authUrl: `${process.env.BASE_URL}/auth/google`
       });
     }

     res.json({
       id: customer.id,
       email: customer.email,
       name: customer.name,
       accessToken: customer.google_access_token,
       refreshToken: customer.google_refresh_token,
       scopes: tokenValidation.scopes,
       expiresIn: tokenValidation.expires_in,
       createdAt: customer.created_at,
       hasGoogleAuth: true
     });

   } catch (error) {
     console.error('Google API error:', error);
     res.status(500).json({
       error: 'internal_error',
       message: 'Internal server error'
     });
   }
 });

 // Get Google tokens
 router.get('/api/customer/:id/google/tokens', async (req, res) => {
   try {
     console.log('Google API call for customer:', req.params.id);
     const customer = await getCustomerById(req.params.id);

     if (!customer) {
       console.log('Customer not found:', req.params.id);
       return res.status(404).json({
         error: 'customer_not_found',
         message: 'Customer not found. Please authenticate first.',
         authUrl: `${process.env.BASE_URL}/auth/google`
       });
     }

     if (!customer.google_access_token) {
       console.log('No Google token found for:', customer.email);
       return res.status(403).json({
         error: 'no_google_token',
         message: 'No Google access token found. Please re-authenticate with Google.',
         authUrl: `${process.env.BASE_URL}/auth/google`
       });
     }

     console.log('Customer found, validating Google token for:', customer.email);
     const tokenValidation = await validateToken(customer.google_access_token);

     if (!tokenValidation.valid) {
       console.log('Google token validation failed for:', customer.email);
       return res.status(403).json({
         error: 'invalid_google_token',
         message: 'Google access token is invalid or expired. Please re-authenticate with Google.',
         authUrl: `${process.env.BASE_URL}/auth/google`
       });
     }

     res.json({
       integration: 'google',
       customer_id: customer.id,
       email: customer.email,
       name: customer.name,
       accessToken: customer.google_access_token,
       refreshToken: customer.google_refresh_token,
       scopes: tokenValidation.scopes,
       expiresIn: tokenValidation.expires_in,
       createdAt: customer.created_at,
       connected: true
     });

   } catch (error) {
     console.error('Google API error:', error);
     res.status(500).json({
       error: 'internal_error',
       message: 'Internal server error'
     });
   }
 });

 // Get Google status
 router.get('/api/customer/:id/google/status', async (req, res) => {
   try {
     const customer = await getCustomerById(req.params.id);

     if (!customer) {
       return res.status(404).json({ error: 'Customer not found' });
     }

     if (!customer.google_access_token) {
       return res.json({
         integration: 'google',
         connected: false,
         message: 'Google not connected',
         authUrl: `${process.env.BASE_URL}/auth/google`
       });
     }

     const validation = await validateToken(customer.google_access_token);

     res.json({
       integration: 'google',
       connected: validation.valid,
       expiresIn: validation.expires_in,
       scopes: validation.scopes,
       tokenExpiry: customer.token_expiry
     });

   } catch (error) {
     res.status(500).json({ error: error.message });
   }
 });

 // Refresh Google tokens
 router.post('/api/customer/:id/google/refresh', async (req, res) => {
   try {
     const customer = await getCustomerById(req.params.id);

     if (!customer?.google_refresh_token) {
       return res.status(404).json({
         success: false,
         error: 'no_refresh_token',
         message: 'No Google refresh token found for customer'
       });
     }

     console.log('🔄 Refreshing Google tokens for:', customer.email);

     const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
       method: 'POST',
       headers: {
         'Content-Type': 'application/x-www-form-urlencoded',
       },
       body: new URLSearchParams({
         client_id: process.env.GOOGLE_CLIENT_ID,
         client_secret: process.env.GOOGLE_CLIENT_SECRET,
         refresh_token: customer.google_refresh_token,
         grant_type: 'refresh_token'
       })
     });

     const tokenData = await tokenResponse.json();
     
     if (tokenData?.access_token) {
       const expiresIn = tokenData.expires_in || 3600;
       const newExpiry = new Date(Date.now() + (expiresIn * 1000));
       
       await updateCustomerGoogleTokens(customer.id, {
         googleAccessToken: tokenData.access_token,
         googleRefreshToken: tokenData.refresh_token || customer.google_refresh_token,
         googleTokenExpiry: newExpiry,
         googleScopes: customer.google_scopes
       });

       console.log('✅ Google tokens refreshed successfully for:', customer.email);

       res.json({
         success: true,
         accessToken: tokenData.access_token,
         tokenExpiry: newExpiry.toISOString(),
         expiresIn: expiresIn,
         scopes: customer.google_scopes,
         message: 'Google tokens refreshed successfully'
       });
     } else {
       console.log('❌ No access_token found in Google response');
       throw new Error(tokenData.error_description || 'Invalid refresh response from Google');
     }
   } catch (error) {
     console.error('❌ Google token refresh failed:', error.message);
     res.status(400).json({
       success: false,
       error: 'refresh_failed',
       message: 'Google token refresh failed. Customer may need to re-authenticate.',
       details: error.message
     });
   }
 });

 // Get Google live status
 router.get('/api/customer/:id/google/status/live', async (req, res) => {
   try {
     const customer = await getCustomerById(req.params.id);
     
     if (!customer?.google_access_token) {
       return res.status(404).json({ error: 'Customer or token not found' });
     }
     
     const response = await fetch(`https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${customer.google_access_token}`);
     
     if (response.ok) {
       const data = await response.json();
       res.json({
         status: `Valid (${data.expires_in}s)`,
         expires_in: data.expires_in,
         email: data.email,
         scopes: data.scope.split(' ').length + ' scopes'
       });
     } else {
       res.json({ status: 'Invalid', valid: false });
     }
   } catch (error) {
     res.status(500).json({ error: error.message });
   }
 });

 // Refresh customer tokens (legacy endpoint)
 router.post('/api/customer/:id/refresh-tokens', async (req, res) => {
   try {
     const customer = await getCustomerById(req.params.id);

     if (!customer || !customer.google_refresh_token) {
       return res.status(404).json({
         success: false,
         error: 'Customer or refresh token not found'
       });
     }

     console.log('🔄 Refreshing tokens for:', customer.email);

     const response = await fetch('https://oauth2.googleapis.com/token', {
       method: 'POST',
       headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
       body: new URLSearchParams({
         client_id: process.env.GOOGLE_CLIENT_ID,
         client_secret: process.env.GOOGLE_CLIENT_SECRET,
         refresh_token: customer.google_refresh_token,
         grant_type: 'refresh_token'
       })
     });

     const tokens = await response.json();

     if (tokens.access_token) {
       const newExpiry = new Date(Date.now() + (tokens.expires_in * 1000));

       const stmt = db.prepare(`
         UPDATE customers 
         SET google_access_token = ?, token_expiry = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?
       `);

       stmt.run([tokens.access_token, newExpiry.toISOString(), customer.id]);
       stmt.finalize();

       console.log('✅ Tokens refreshed for:', customer.email);

       res.json({
         success: true,
         newExpiry: newExpiry.toISOString(),
         expiresIn: tokens.expires_in
       });
     } else {
       console.log('❌ Token refresh failed for:', customer.email);
       res.status(400).json({
         success: false,
         error: 'Token refresh failed',
         details: tokens
       });
     }
   } catch (error) {
     console.error('Token refresh error:', error);
     res.status(500).json({
       success: false,
       error: error.message
     });
   }
 });

 // =============================================================================
 // GOOGLE PICKER & SPREADSHEET MANAGEMENT
 // =============================================================================

// Serve picker setup page
// Replace the entire "/setup/spreadsheet" route (around line 350) with this updated version:

router.get('/setup/spreadsheet', async (req, res) => {
  try {
    if (!req.isAuthenticated() && !req.session?.authenticated) {
      return res.redirect('/login?redirect=/setup/spreadsheet');
    }

    const userId = req.user?.id || req.session?.userInfo?.customerId;
    const userEmail = req.user?.email || req.session?.userInfo?.email;
    const userName = req.user?.name || req.session?.userInfo?.name || 'User';

    if (!userId) {
      return res.redirect('/login?error=no_user_id');
    }

    const customer = await getCustomerById(userId);
    
    if (!customer?.google_access_token) {
      return res.redirect('/auth/google?setup=spreadsheet');
    }

    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Manage Your Spreadsheets</title>
          <script src="https://apis.google.com/js/api.js"></script>
          <style>
              body {
                  font-family: 'Google Sans', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                  margin: 0;
                  padding: 20px;
                  background: linear-gradient(135deg, #f8fbff 0%, #e8f0fe 100%);
                  min-height: 100vh;
                  color: #202124;
                  line-height: 1.5;
              }
              
              .container {
                  max-width: 1000px;
                  margin: 0 auto;
                  background: white;
                  padding: 40px;
                  border-radius: 12px;
                  box-shadow: 0 4px 16px rgba(26,115,232,0.1);
                  border: 1px solid #dadce0;
              }
              
              .header {
                  display: flex;
                  align-items: center;
                  gap: 12px;
                  margin-bottom: 24px;
                  padding-bottom: 20px;
                  border-bottom: 1px solid #dadce0;
              }
              
              .header-icon {
                  width: 32px;
                  height: 32px;
                  background: linear-gradient(45deg, #4285f4, #34a853, #fbbc05, #ea4335);
                  border-radius: 6px;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  font-size: 18px;
                  color: white;
              }
              
              h1 {
                  margin: 0;
                  color: #202124;
                  font-size: 28px;
                  font-weight: 400;
              }
              
              .subtitle {
                  color: #5f6368;
                  font-size: 16px;
                  margin-bottom: 32px;
                  line-height: 1.5;
              }
              
              .info-banner {
                  background: linear-gradient(135deg, #e8f0fe 0%, #f0f7ff 100%);
                  border: 1px solid #4285f4;
                  border-radius: 8px;
                  padding: 16px;
                  margin: 20px 0;
                  color: #1967d2;
              }
              
              .info-banner strong {
                  color: #1a73e8;
              }
              
              /* Google Material Design Buttons */
              .btn {
                  display: inline-flex;
                  align-items: center;
                  gap: 8px;
                  padding: 12px 24px;
                  border: 1px solid transparent;
                  border-radius: 6px;
                  font-size: 14px;
                  font-weight: 500;
                  cursor: pointer;
                  text-decoration: none;
                  transition: all 0.2s ease;
                  font-family: 'Google Sans', sans-serif;
                  margin: 4px;
                  box-shadow: 0 1px 2px rgba(60,64,67,0.1);
              }
              
              .btn:hover {
                  box-shadow: 0 2px 8px rgba(60,64,67,0.15);
                  transform: translateY(-1px);
              }
              
              .btn:disabled {
                  background: #f8f9fa;
                  color: #5f6368;
                  cursor: not-allowed;
                  box-shadow: none;
                  transform: none;
              }
              
              .btn-primary {
                  background: #1a73e8;
                  color: white;
                  border-color: #1a73e8;
              }
              
              .btn-primary:hover {
                  background: #1557b0;
                  border-color: #1557b0;
              }
              
              .btn-success {
                  background: #34a853;
                  color: white;
                  border-color: #34a853;
              }
              
              .btn-success:hover {
                  background: #2d7d32;
                  border-color: #2d7d32;
              }
              
              .btn-danger {
                  background: #ea4335;
                  color: white;
                  border-color: #ea4335;
              }
              
              .btn-danger:hover {
                  background: #d33b2c;
                  border-color: #d33b2c;
              }
              
              .btn-secondary {
                  background: white;
                  color: #5f6368;
                  border-color: #dadce0;
              }
              
              .btn-secondary:hover {
                  background: #f8f9fa;
                  border-color: #dadce0;
              }
              
              /* Status Messages */
              .status {
                  margin: 20px 0;
                  padding: 16px;
                  border-radius: 8px;
                  display: none;
                  font-weight: 500;
              }
              
              .status.success {
                  background: #e8f5e9;
                  color: #137333;
                  border: 1px solid #34a853;
              }
              
              .status.error {
                  background: #fce8e6;
                  color: #d93025;
                  border: 1px solid #ea4335;
              }
              
              .status.warning {
                  background: #fef7e0;
                  color: #ea8600;
                  border: 1px solid #fbbc04;
              }
              
              .status.info {
                  background: #e8f0fe;
                  color: #1967d2;
                  border: 1px solid #4285f4;
              }
              
              /* Spreadsheet List */
              .spreadsheet-section {
                  margin: 32px 0;
              }
              
              .section-title {
                  font-size: 20px;
                  font-weight: 500;
                  color: #202124;
                  margin: 0 0 16px 0;
                  display: flex;
                  align-items: center;
                  gap: 8px;
              }
              
              .spreadsheet-item {
                  background: #fafbfc;
                  border: 1px solid #dadce0;
                  border-radius: 8px;
                  padding: 20px;
                  margin: 12px 0;
                  display: flex;
                  justify-content: space-between;
                  align-items: center;
                  transition: all 0.2s ease;
              }
              
              .spreadsheet-item:hover {
                  border-color: #4285f4;
                  box-shadow: 0 2px 8px rgba(26,115,232,0.1);
              }
              
              .spreadsheet-item.broken {
                  border-color: #ea4335;
                  background: #fef7f0;
              }
              
              .spreadsheet-info {
                  flex-grow: 1;
              }
              
              .spreadsheet-name {
                  font-size: 16px;
                  font-weight: 500;
                  color: #202124;
                  margin: 0 0 4px 0;
              }
              
              .spreadsheet-details {
                  color: #5f6368;
                  font-size: 14px;
                  line-height: 1.4;
              }
              
              .spreadsheet-details code {
                  background: #f1f3f4;
                  padding: 2px 6px;
                  border-radius: 4px;
                  font-size: 12px;
                  color: #5f6368;
              }
              
              .status-badge {
                  padding: 6px 12px;
                  border-radius: 16px;
                  font-size: 12px;
                  font-weight: 500;
                  margin-left: 12px;
              }
              
              .status-working {
                  background: #e8f5e9;
                  color: #137333;
              }
              
              .status-broken {
                  background: #fce8e6;
                  color: #d93025;
              }
              
              .actions {
                  display: flex;
                  gap: 8px;
                  align-items: center;
              }
              
              /* Loading Spinner */
              .loading {
                  display: inline-block;
                  width: 20px;
                  height: 20px;
                  border: 2px solid #f1f3f4;
                  border-top: 2px solid #4285f4;
                  border-radius: 50%;
                  animation: spin 1s linear infinite;
              }
              
              @keyframes spin {
                  0% { transform: rotate(0deg); }
                  100% { transform: rotate(360deg); }
              }
              
              .empty-state {
                  text-align: center;
                  padding: 40px;
                  color: #5f6368;
                  background: #fafbfc;
                  border: 1px dashed #dadce0;
                  border-radius: 8px;
              }
              
              /* Create New Section */
              .create-section {
                  background: linear-gradient(135deg, #f0f7ff 0%, #e8f0fe 100%);
                  border: 1px solid #4285f4;
                  border-radius: 8px;
                  padding: 24px;
                  margin: 24px 0;
              }
              
              .create-section h4 {
                  margin: 0 0 16px 0;
                  color: #1967d2;
                  font-size: 16px;
                  font-weight: 500;
              }
              
              .create-form {
                  display: flex;
                  gap: 12px;
                  align-items: center;
                  flex-wrap: wrap;
              }
              
              .create-form input {
                  flex: 1;
                  min-width: 250px;
                  padding: 12px 16px;
                  border: 1px solid #dadce0;
                  border-radius: 6px;
                  font-size: 14px;
                  font-family: 'Google Sans', sans-serif;
                  background: white;
              }
              
              .create-form input:focus {
                  outline: none;
                  border-color: #4285f4;
                  box-shadow: 0 0 0 2px rgba(66,133,244,0.2);
              }
              
              .help-text {
                  color: #5f6368;
                  font-size: 13px;
                  margin-top: 8px;
                  display: block;
              }
              
              /* Navigation */
              .navigation {
                  text-align: center;
                  margin: 40px 0 0 0;
                  padding: 24px 0 0 0;
                  border-top: 1px solid #dadce0;
              }
              
              /* Responsive Design */
              @media (max-width: 768px) {
                  .container {
                      padding: 24px 16px;
                      margin: 16px;
                  }
                  
                  .spreadsheet-item {
                      flex-direction: column;
                      align-items: flex-start;
                      gap: 16px;
                  }
                  
                  .actions {
                      align-self: stretch;
                      justify-content: flex-end;
                  }
                  
                  .create-form {
                      flex-direction: column;
                      align-items: stretch;
                  }
                  
                  .create-form input {
                      min-width: auto;
                  }
              }
          </style>
      </head>
      <body>
          <div class="container">
              <div class="header">
                  <div class="header-icon">📊</div>
                  <h1>Manage Your Spreadsheets</h1>
              </div>
              
              <p class="subtitle">Connect Google Sheets for automated data access from n8n workflows.</p>
              
              <div class="info-banner">
                  <strong>Ready!</strong> Select an option below to add spreadsheets.
              </div>
                                         
              <div id="status" class="status"></div>
              
              <div class="spreadsheet-section">
                  <h3 class="section-title">
                      📋 Connected Spreadsheets
                  </h3>
                  <div id="spreadsheetsList">
                      <div style="text-align: center; padding: 20px;">
                          <div class="loading"></div>
                          <span style="margin-left: 8px; color: #5f6368;">Loading spreadsheets...</span>
                      </div>
                  </div>
              </div>

              <div class="spreadsheet-section">
                  <h3 class="section-title">
                      ➕ Add New Spreadsheet
                  </h3>
                  
                  <button id="addSpreadsheet" class="btn btn-primary" onclick="openPicker()">
                      📋 Select Existing Spreadsheet
                  </button>
                  
                  <div class="create-section">
                      <h4>✨ Create New Spreadsheet</h4>
                      <div class="create-form">
                          <input type="text" id="newSpreadsheetName" placeholder="Enter spreadsheet name..." 
                                 autocomplete="off">
                          <button id="createNew" class="btn btn-success" onclick="createNewSpreadsheet()">
                              ✨ Create New Spreadsheet
                          </button>
                      </div>
                      <small class="help-text">
                          Leave blank to auto-generate name like "Expense Tracker - ${userName}"
                      </small>
                  </div>
              </div>

              <div class="navigation">
                  <a href="/dashboard" class="btn btn-secondary">← Portal Home</a>
              </div>
          </div>

          <script>
              const userId = '${userId}';
              const userEmail = '${userEmail}';
              const userName = '${userName}';
              let selectedFile = null;

              async function init() {
                  try {
                      await loadGooglePicker();
                      await loadSpreadsheets();
                  } catch (error) {
                      console.error('Initialization error:', error);
                      showStatus('error', 'Setup failed: ' + error.message);
                  }
              }

              function getNewSpreadsheetName() {
                  const nameInput = document.getElementById('newSpreadsheetName');
                  const customName = nameInput.value.trim();
                  
                  if (customName) {
                      return customName;
                  }
                  
                  // Auto-generate name if empty
                  return \`Expense Tracker - \${userName || userEmail.split('@')[0]}\`;
              }

              async function loadSpreadsheets() {
                  try {
                      const response = await fetch('/api/customer/' + userId + '/spreadsheets');
                      const data = await response.json();
                      
                      displaySpreadsheets(data.spreadsheets || []);
                  } catch (error) {
                      console.error('Failed to load spreadsheets:', error);
                      document.getElementById('spreadsheetsList').innerHTML = 
                          '<div class="status error" style="display: block;">Failed to load spreadsheets</div>';
                  }
              }

              function displaySpreadsheets(spreadsheets) {
                  const container = document.getElementById('spreadsheetsList');
                  
                  if (!spreadsheets || spreadsheets.length === 0) {
                      container.innerHTML = 
                          '<div class="empty-state">📝 No spreadsheets connected yet.<br><strong>Add your first spreadsheet below!</strong></div>';
                      return;
                  }

                  container.innerHTML = spreadsheets.map(sheet => {
                      const date = new Date(sheet.selected_at).toLocaleDateString();
                      const time = new Date(sheet.selected_at).toLocaleTimeString();
                      
                      return \`
                          <div class="spreadsheet-item broken">
                              <div class="spreadsheet-info">
                                  <div class="spreadsheet-name">\${sheet.file_name}</div>
                                  <div class="spreadsheet-details">
                                      <strong>Purpose:</strong> \${sheet.purpose} • <strong>Added:</strong> \${date} at \${time}<br>
                                      <strong>File ID:</strong> <code>\${sheet.file_id}</code>
                                  </div>
                              </div>
                              <div class="actions">
                                  <span class="status-badge status-broken">API Access Broken</span>
                                  <button class="btn btn-primary" onclick="openInDrive('\${sheet.file_id}')">
                                      🔗 Open in Sheets
                                  </button>
                                  <button class="btn btn-danger" onclick="removeSpreadsheet('\${sheet.file_id}', '\${sheet.file_name}')">
                                      🗑️ Remove
                                  </button>
                              </div>
                          </div>
                      \`;
                  }).join('');
              }

              function openInDrive(fileId) {
                  window.open(\`https://docs.google.com/spreadsheets/d/\${fileId}/edit\`, '_blank');
              }

              async function removeSpreadsheet(fileId, fileName) {
                  console.log('🔍 Attempting DELETE to:', \`/api/customer/\${userId}/spreadsheet/\${fileId}\`);

                  if (!confirm(\`Remove "\${fileName}" from connected spreadsheets?\`)) {
                      return;
                  }

                  try {
                      showStatus('info', 'Removing spreadsheet...');
        
                      const response = await fetch(\`/api/customer/\${userId}/spreadsheet/\${fileId}\`, {
                          method: 'DELETE'
                      });
        
                      if (response.ok) {
                          showStatus('success', \`"\${fileName}" removed successfully\`);
                          await loadSpreadsheets(); // Refresh the list automatically
                      } else {
                          const errorData = await response.json();
                          throw new Error(errorData.error || 'Failed to remove spreadsheet');
                      }
                  } catch (error) {
                      showStatus('error', 'Failed to remove spreadsheet: ' + error.message);
                  }
              }

              function loadGooglePicker() {
                  return new Promise((resolve, reject) => {
                      gapi.load('picker', {
                          callback: resolve,
                          onerror: reject
                      });
                  });
              }

              async function openPicker() {
                  try {
                      const tokenResponse = await fetch('/api/customer/' + userId + '/google/tokens');
                      const tokenData = await tokenResponse.json();
                      
                      if (!tokenResponse.ok) {
                          throw new Error(tokenData.message || 'Failed to get access token');
                      }

                      const picker = new google.picker.PickerBuilder()
                          .addView(google.picker.ViewId.SPREADSHEETS)
                          .setOAuthToken(tokenData.accessToken)
                          .setDeveloperKey('${process.env.GOOGLE_API_KEY}')
                          .setCallback(pickerCallback)
                          .setTitle('Select Spreadsheet to Connect')
                          .build();

                      picker.setVisible(true);
                  } catch (error) {
                      showStatus('error', 'Failed to open picker: ' + error.message);
                  }
              }

              function pickerCallback(data) {
                  if (data.action === google.picker.Action.PICKED) {
                      selectedFile = data.docs[0];
                      saveSelectedSpreadsheet();
                  } else if (data.action === google.picker.Action.CANCEL) {
                      showStatus('info', 'Selection cancelled.');
                  }
              }

              async function createNewSpreadsheet() {
                  const button = document.getElementById('createNew');
                  const nameInput = document.getElementById('newSpreadsheetName');
                  const originalText = button.innerHTML;
                  
                  button.disabled = true;
                  button.innerHTML = '<span class="loading"></span> Creating...';

                  try {
                      const spreadsheetName = getNewSpreadsheetName();
                      const response = await fetch('/api/customer/' + userId + '/spreadsheet/create', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ 
                              name: spreadsheetName 
                          })
                      });

                      const data = await response.json();

                      if (!response.ok) {
                          throw new Error(data.error || 'Failed to create spreadsheet');
                      }

                      showStatus('success', \`New spreadsheet "\${data.spreadsheet.fileName}" created successfully!\`);
                      nameInput.value = ''; // Clear the input
                      await loadSpreadsheets(); // Refresh the list

                  } catch (error) {
                      showStatus('error', 'Failed to create spreadsheet: ' + error.message);
                  } finally {
                      button.disabled = false;
                      button.innerHTML = originalText;
                  }
              }

              async function saveSelectedSpreadsheet() {
                  if (!selectedFile) {
                      showStatus('error', 'No file selected');
                      return;
                  }

                  try {
                      showStatus('info', 'Saving spreadsheet connection...');
                      
                      const saveResponse = await fetch('/api/customer/' + userId + '/spreadsheet', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                              fileId: selectedFile.id,
                              fileName: selectedFile.name,
                              purpose: 'General'
                          })
                      });

                      const saveData = await saveResponse.json();
                      if (!saveResponse.ok) {
                          throw new Error(saveData.error || 'Failed to save spreadsheet');
                      }

                      showStatus('success', \`"\${selectedFile.name}" connected successfully!\`);
                      await loadSpreadsheets(); // Refresh the list
                      selectedFile = null;

                  } catch (error) {
                      showStatus('error', 'Failed to save: ' + error.message);
                  }
              }

              function showStatus(type, message) {
                  const status = document.getElementById('status');
                  status.className = 'status ' + type;
                  status.innerHTML = message;
                  status.style.display = 'block';
                  
                  if (type === 'success') {
                      setTimeout(() => {
                          status.style.display = 'none';
                      }, 5000);
                  }
              }

              window.addEventListener('load', init);
          </script>
      </body>
      </html>
    `);

  } catch (error) {
    console.error('Spreadsheet setup error:', error);
    res.status(500).send('Setup page error: ' + error.message);
  }
});


// Remove a spreadsheet
router.delete('/api/customer/:id/spreadsheet/:fileId', async (req, res) => {
  try {
    const { id: customerId, fileId } = req.params;
    console.log('🗑️ DELETE endpoint hit:', { customerId, fileId });
    
    db.run(`DELETE FROM customer_spreadsheets WHERE customer_id = ? AND file_id = ?`, [customerId, fileId], function(err) {
      if (err) {
        console.error('❌ Remove spreadsheet error:', err);
        return res.status(500).json({ error: 'Server error' });
      }
      
      console.log('🗑️ Delete result - changes:', this.changes);
      
      if (this.changes > 0) {
        console.log('✅ Spreadsheet removed successfully');
        res.json({ success: true, message: 'Spreadsheet removed successfully' });
      } else {
        console.log('❌ Spreadsheet not found in database');
        res.status(404).json({ error: 'Spreadsheet not found' });
      }
    });
    
  } catch (error) {
    console.error('❌ Remove spreadsheet error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});



















// Save selected spreadsheet  
router.post('/api/customer/:id/spreadsheet', async (req, res) => {
  try {
    const { fileId, fileName, purpose } = req.body;  // Add purpose here
    const customerId = req.params.id;

    if (!fileId || !fileName) {
      return res.status(400).json({ error: 'Missing fileId or fileName' });
    }

    const customer = await getCustomerById(customerId);
    if (!customer?.google_access_token) {
      return res.status(403).json({ error: 'No valid Google authentication' });
    }

    const finalPurpose = purpose || 'General';  // Default to General if not provided

    const stmt = db.prepare(`
      INSERT OR REPLACE INTO customer_spreadsheets 
      (customer_id, file_id, file_name, purpose, selected_at) 
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    stmt.run([customerId, fileId, fileName, finalPurpose], function (err) {
      if (err) {
        console.error('Error saving spreadsheet:', err);
        return res.status(500).json({ error: 'Failed to save spreadsheet' });
      }

      console.log('✅ Spreadsheet saved to new table:', customer.email, '- File:', fileName, '- Purpose:', finalPurpose);
      
      res.json({ 
        success: true, 
        message: 'Spreadsheet configuration saved',
        spreadsheet: { fileId, fileName, purpose: finalPurpose }
      });
    });

    stmt.finalize();

  } catch (error) {
    console.error('Save spreadsheet error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

 // Create new expense spreadsheet
router.post('/api/customer/:id/spreadsheet/create', async (req, res) => {
  try {
    const customerId = req.params.id;
    const { name } = req.body; // Get custom name from request
    const customer = await getCustomerById(customerId);

    if (!customer?.google_access_token) {
      return res.status(403).json({ error: 'No valid Google authentication' });
    }

    // Use custom name or default
    const spreadsheetName = name || `Expense Tracker - ${customer.name || customer.email}`;

    const createResponse = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${customer.google_access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        properties: {
          title: spreadsheetName
        },
        sheets: [{
          properties: {
            title: 'Receipts'
          }
        }]
      })
    });

    const spreadsheetData = await createResponse.json();

    if (!createResponse.ok) {
      throw new Error(spreadsheetData.error?.message || 'Failed to create spreadsheet');
    }

    const fileId = spreadsheetData.spreadsheetId;
    const fileName = spreadsheetData.properties.title;

    // Add headers to the spreadsheet
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${fileId}/values/Receipts!A1:F1?valueInputOption=RAW`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${customer.google_access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        values: [['Merchant', 'Date', 'Amount', 'Tax', 'Category', 'Items']]
      })
    });

    // Save to database
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO customer_spreadsheets 
      (customer_id, file_id, file_name, purpose, selected_at) 
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    stmt.run([customerId, fileId, fileName, 'General'], function (err) {
      if (err) {
        console.error('Error saving new spreadsheet:', err);
        return res.status(500).json({ error: 'Failed to save spreadsheet' });
      }

      console.log('✅ New spreadsheet created for:', customer.email);
      
      res.json({
        success: true,
        spreadsheet: {
          fileId,
          fileName,
          url: `https://docs.google.com/spreadsheets/d/${fileId}`
        }
      });
    });

    stmt.finalize();

  } catch (error) {
    console.error('Create spreadsheet error:', error);
    res.status(500).json({ error: error.message });
  }
});






















 // Get customer's configured spreadsheet (for n8n)
 router.get('/api/customer/:id/spreadsheet', async (req, res) => {
   try {
     const customer = await getCustomerById(req.params.id);

     if (!customer) {
       return res.status(404).json({ error: 'Customer not found' });
     }

     if (!customer.selected_spreadsheet_id) {
       return res.status(404).json({ 
         error: 'No spreadsheet configured',
         message: 'Customer needs to configure a spreadsheet first',
         setupUrl: `https://auth.robosouthla.com/setup/spreadsheet`
       });
     }

     res.json({
       fileId: customer.selected_spreadsheet_id,
       fileName: customer.selected_spreadsheet_name,
       selectedAt: customer.spreadsheet_selected_at,
       customer: {
         id: customer.id,
         email: customer.email,
         name: customer.name
       }
     });

   } catch (error) {
     console.error('Get spreadsheet error:', error);
     res.status(500).json({ error: 'Server error' });
   }
 });

 // Get spreadsheet by Telegram chat ID (for n8n integration)
 router.get('/api/telegram/:chatId/spreadsheet', async (req, res) => {
   try {
     const { chatId } = req.params;
     
     const customer = await getCustomerById(chatId);

     if (!customer?.selected_spreadsheet_id) {
       return res.status(404).json({ 
         error: 'No spreadsheet configured for this user',
         setupUrl: `https://auth.robosouthla.com/setup/spreadsheet`
       });
     }

     res.json({
       fileId: customer.selected_spreadsheet_id,
       fileName: customer.selected_spreadsheet_name,
       sheetName: 'Receipts'
     });

   } catch (error) {
     console.error('Telegram spreadsheet lookup error:', error);
     res.status(500).json({ error: 'Server error' });
   }
 });

// Grant API write permissions after picker selection
router.post('/api/customer/:id/spreadsheet/grant-access', async (req, res) => {
  try {
    const customerId = req.params.id;

    const customer = await getCustomerById(customerId);
    if (!customer?.google_access_token) {
      return res.status(403).json({ error: 'No valid Google authentication' });
    }

    if (!customer.selected_spreadsheet_id) {
      return res.status(400).json({ error: 'No spreadsheet configured' });
    }

    
    // Use the file ID from database instead of request body
    const fileId = customer.selected_spreadsheet_id;
    console.log('🔍 Customer data:', {
      id: customer.id,
      email: customer.email,
      selected_spreadsheet_id: customer.selected_spreadsheet_id,
      has_access_token: !!customer.google_access_token
    });
    console.log('🔍 Using file ID from database:', fileId);
    console.log('Granting API access for file:', fileId, 'to customer:', customer.email);

    // Create a timeout promise
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timeout')), 10000)
    );

    try {
      const fetchPromise = fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,permissions`, {
        headers: {
          'Authorization': `Bearer ${customer.google_access_token}`
        }
      });

      const fileCheckResponse = await Promise.race([fetchPromise, timeoutPromise]);
      
      // if (!fileCheckResponse.ok) {
      //   console.log('❌ Drive API returned status:', fileCheckResponse.status);
      //   return res.status(403).json({ 
      //     error: 'Cannot access file',
      //     message: 'File not accessible with current permissions'
      //   });
      // }

      if (!fileCheckResponse.ok) {
        const errorBody = await fileCheckResponse.text();
        console.log('❌ Drive API returned status:', fileCheckResponse.status);
        console.log('❌ Drive API error details:', errorBody);
        return res.status(403).json({ 
          error: 'Cannot access file',
          message: 'File not accessible with current permissions'
        });
      }

      const fileData = await fileCheckResponse.json();
      console.log('✅ File accessible:', fileData.name);

      res.json({ 
        success: true, 
        message: 'File access confirmed - picker permissions granted',
        fileName: fileData.name
      });

    } catch (error) {
      console.log('❌ Drive API error:', error.message);
      return res.status(500).json({ error: 'Drive API timeout or error', details: error.message });
    }

  } catch (error) {
    console.error('Grant access error:', error);
    res.status(500).json({ 
      error: 'Server error',
      message: error.message 
    });
  }
});


// Get all spreadsheets for a customer
router.get('/api/customer/:id/spreadsheets', async (req, res) => {
  try {
    const customerId = req.params.id;
    console.log('🔍 Getting spreadsheets for customer:', customerId);
    
    db.all(`
      SELECT file_id, file_name, purpose, selected_at, created_at 
      FROM customer_spreadsheets 
      WHERE customer_id = ?
      ORDER BY selected_at DESC
    `, [customerId], (err, rows) => {
      if (err) {
        console.error('Query error:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      
      console.log('🔍 Found spreadsheets:', rows);
      
      res.json({
        customer_id: customerId,
        spreadsheets: rows
      });
    });
    
  } catch (error) {
    console.error('Get spreadsheets error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});




return router;
};