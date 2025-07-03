// routes/customers.js
const express = require('express');
const router = express.Router();

module.exports = (dependencies) => {
  const { 
    getAllCustomers,
    getCustomerById,
    validateToken,
    validateQBToken,
    QB_ENVIRONMENT
  } = dependencies;

  // =============================================================================
  // GENERAL CUSTOMER API ROUTES
  // =============================================================================

  // Get all customers
  router.get('/api/customers', async (req, res) => {
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

  // Get latest customer
  router.get('/api/customers/latest', async (req, res) => {
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

  // Get customer count
  router.get('/api/customers/count', async (req, res) => {
    try {
      const customers = await getAllCustomers();
      res.json({ count: customers.length });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Search customers
  router.get('/api/customers/search', async (req, res) => {
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

  // =============================================================================
  // INTEGRATION STATUS ROUTES
  // =============================================================================

  // Get all integrations status for a customer
  router.get('/api/customer/:id/integrations', async (req, res) => {
    try {
      const customer = await getCustomerById(req.params.id);

      if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
      }

      // Check Google status
      let googleStatus = { connected: false, integration: 'google' };
      if (customer.google_access_token) {
        const googleValidation = await validateToken(customer.google_access_token);
        googleStatus = {
          integration: 'google',
          connected: googleValidation.valid,
          expiresIn: googleValidation.expires_in,
          scopes: googleValidation.scopes,
          authUrl: `${process.env.BASE_URL}/auth/google`
        };
      }

      // Check QuickBooks status
      let quickbooksStatus = { connected: false, integration: 'quickbooks' };
      if (customer.qb_access_token && customer.qb_company_id) {
        const qbValidation = await validateQBToken(customer.qb_access_token, customer.qb_company_id);
        quickbooksStatus = {
          integration: 'quickbooks',
          connected: qbValidation.valid,
          companyId: customer.qb_company_id,
          environment: QB_ENVIRONMENT,
          authUrl: `${process.env.BASE_URL}/auth/quickbooks/standalone`
        };
      }

      res.json({
        customer_id: customer.id,
        email: customer.email,
        name: customer.name,
        integrations: {
          google: googleStatus,
          quickbooks: quickbooksStatus
        },
        createdAt: customer.created_at
      });

    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get specific integration status (redirect helper)
  router.get('/api/customer/:id/integration/:service/status', async (req, res) => {
    const { id, service } = req.params;

    // Redirect to specific integration status endpoint
    switch (service.toLowerCase()) {
      case 'google':
        return res.redirect(`/api/customer/${id}/google/status`);
      case 'quickbooks':
      case 'qb':
        return res.redirect(`/api/customer/${id}/quickbooks/status`);
      default:
        return res.status(400).json({
          error: 'invalid_integration',
          message: `Integration '${service}' not supported`,
          supported: ['google', 'quickbooks']
        });
    }
  });

  return router;
};