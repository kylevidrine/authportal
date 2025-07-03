const express = require('express');
const router = express.Router();

// =============================================================================
// API ROUTES - START
// =============================================================================


app.get('/api/customer/:id', async (req, res) => {
  try {
    console.log('API call for customer:', req.params.id);
    const customer = await getCustomerById(req.params.id);

    if (!customer) {
      console.log('Customer not found:', req.params.id);
      return res.status(404).json({
        error: 'customer_not_found',
        message: 'Customer not found. Please authenticate first.',
        authUrl: `https://auth.robosouthla.com/auth/google`
      });
    }

    // ONLY CHECK GOOGLE - Don't check session or QuickBooks
    if (!customer.google_access_token) {
      console.log('No Google token found for:', customer.email);
      return res.status(403).json({
        error: 'no_google_token',
        message: 'No Google access token found. Please re-authenticate with Google.',
        authUrl: `https://auth.robosouthla.com/auth/google`
      });
    }

    console.log('Customer found, validating Google token for:', customer.email);
    const tokenValidation = await validateToken(customer.google_access_token);

    if (!tokenValidation.valid) {
      console.log('Google token validation failed for:', customer.email);
      return res.status(403).json({
        error: 'invalid_google_token',
        message: 'Google access token is invalid or expired. Please re-authenticate with Google.',
        authUrl: `https://auth.robosouthla.com/auth/google`
      });
    }

    // Return Google data - QuickBooks doesn't matter here
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





app.get('/api/customers', async (req, res) => {
  try {
    const customers = await getAllCustomers();
    const customerList = customers.map(customer => ({
      id: customer.id,
      email: customer.email,
      name: customer.name,
      hasGoogleAuth: !!customer.google_access_token,
      createdAt: customer.created_at,
      tokenExpiry: customer.token_expiry
    }));
    res.json(customerList);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});





app.get('/api/customers/latest', async (req, res) => {
  try {
    const customers = await getAllCustomers();
    if (customers.length > 0) {
      const latest = customers[0];
      res.json({
        id: latest.id,
        email: latest.email,
        name: latest.name,
        hasGoogleAuth: !!latest.google_access_token,
        createdAt: latest.created_at
      });
    } else {
      res.status(404).json({ error: 'No customers found' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});





app.get('/api/customers/count', async (req, res) => {
  try {
    const customers = await getAllCustomers();
    res.json({ count: customers.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


app.get('/api/customers/search', async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) {
      return res.status(400).json({ error: 'Email parameter required' });
    }

    const customers = await getAllCustomers();
    const found = customers.filter(c =>
      c.email.toLowerCase().includes(email.toLowerCase())
    );

    res.json(found.map(customer => ({
      id: customer.id,
      email: customer.email,
      name: customer.name,
      hasGoogleAuth: !!customer.google_access_token,
      hasQuickBooksAuth: !!(customer.qb_access_token && customer.qb_company_id),
      createdAt: customer.created_at,
      tokenExpiry: customer.token_expiry,
      // Optional: Add QB-specific info
      quickbooksInfo: {
        connected: !!(customer.qb_access_token && customer.qb_company_id),
        companyId: customer.qb_company_id || null,
        environment: customer.qb_access_token ? QB_ENVIRONMENT : null
      }
    })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});




// Add this to your auth server (server.js)
app.post('/api/customer/:id/refresh-tokens', async (req, res) => {
  try {
    const customer = await getCustomerById(req.params.id);

    if (!customer || !customer.google_refresh_token) {
      return res.status(404).json({
        success: false,
        error: 'Customer or refresh token not found'
      });
    }

    console.log('🔄 Refreshing tokens for:', customer.email);

    // Use Google's token refresh API
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
      // Update database with new tokens
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
// API ROUTES - END
// =============================================================================

module.exports = router;