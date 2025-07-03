// ========================================
// FILE: routes/admin.js
// ========================================

const express = require('express');
const fetch = require('node-fetch');
const { getCustomerById, getAllCustomers } = require('../utils/database');
const { validateQBToken } = require('../utils/validation');
const router = express.Router();

// QB Environment for admin display
const QB_ENVIRONMENT = process.env.QB_ENVIRONMENT || 'production';

// Delete customer route
router.delete('/customer/:id', async (req, res) => {
  try {
    const customerId = req.params.id;

    // Get customer info before deleting for logging
    const customer = await getCustomerById(customerId);

    const { db } = require('../config/database');
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM customers WHERE id = ?', [customerId], function (err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });

    console.log(`Customer deleted: ${customer ? customer.email : customerId}`);

    res.json({
      success: true,
      message: `Customer deleted successfully`,
      customerEmail: customer ? customer.email : 'Unknown'
    });
  } catch (error) {
    console.error('Delete customer error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const customers = await getAllCustomers();
    const customerRows = await Promise.all(customers.map(async customer => {
      let googleTokenStatus = 'Unknown';
      if (customer.google_access_token) {
        try {
          const response = await fetch(`https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${customer.google_access_token}`);
          if (response.ok) {
            const tokenInfo = await response.json();
            const expiresIn = parseInt(tokenInfo.expires_in);
            googleTokenStatus = `Valid (${expiresIn}s)`;
          } else {
            googleTokenStatus = 'Invalid/Expired';
          }
        } catch (error) {
          console.error('Google token validation error:', error.message);
          googleTokenStatus = 'Error checking';
        }
      }
      let qbTokenStatus = 'Not Connected';
      if (customer.qb_access_token && customer.qb_company_id) {
        const qbValidation = await validateQBToken(customer.qb_access_token, customer.qb_company_id);
        qbTokenStatus = qbValidation.valid ? 'Connected' : 'Invalid/Expired';
      }
      return `<tr>
        <td><code style="font-size:12px;">${customer.id}</code></td>
        <td>${customer.email}</td>
        <td>${customer.name}</td>
        <td>
          <span style="padding:2px 8px;border-radius:12px;font-size:11px;background:${googleTokenStatus.includes('Valid') ? '#e8f5e8;color:#2d5a2d' : '#ffeaea;color:#d32f2f'}">${googleTokenStatus}</span>
        </td>
        <td>
          <span style="padding:2px 8px;border-radius:12px;font-size:11px;background:${qbTokenStatus === 'Connected' ? '#e8f5e8;color:#2d5a2d' : qbTokenStatus === 'Not Connected' ? '#f0f0f0;color:#666' : '#ffeaea;color:#d32f2f'}">${qbTokenStatus}</span>
          ${customer.qb_company_id ? `<br><small style="color:#666;">Company: ${customer.qb_company_id}</small>` : ''}
        </td>
        <td>${new Date(customer.created_at).toLocaleDateString()}</td>
        <td>
          <button onclick="copyToClipboard('${customer.id}')" 
                  style="padding:5px 10px;background:#7c3aed;color:white;border:none;border-radius:4px;cursor:pointer;margin:2px;font-size:11px;">
            Copy Customer ID
          </button><br>
          <button onclick="copyToClipboard('${customer.google_access_token || 'N/A'}')" 
                  style="padding:5px 10px;background:#4285f4;color:white;border:none;border-radius:4px;cursor:pointer;margin:2px;font-size:11px;">
            Copy Google Token
          </button><br>
          ${customer.qb_access_token ? `
          <button onclick="copyToClipboard('${customer.qb_access_token}')" 
                  style="padding:5px 10px;background:#0077C5;color:white;border:none;border-radius:4px;cursor:pointer;margin:2px;font-size:11px;">
            Copy QB Token
          </button><br>` : `
          <span style="font-size:11px;color:#999;">No QB Token</span><br>
          `}
          <button onclick="deleteCustomer('${customer.id}', '${customer.email}')" 
                  style="padding:5px 10px;background:#dc3545;color:white;border:none;border-radius:4px;cursor:pointer;margin:2px;font-size:11px;">
            Delete Customer
          </button>
        </td>
      </tr>`;
    }));

    const connectedCustomers = customers.filter(c => c.google_access_token && c.qb_access_token).length;
    const googleOnlyCustomers = customers.filter(c => c.google_access_token && !c.qb_access_token).length;
    const qbOnlyCustomers = customers.filter(c => !c.google_access_token && c.qb_access_token).length;

    res.send(`
      <html>
      <head>
        <title>Admin - Customer Management</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5; }
          .container { max-width: 1400px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; }
          table { width: 100%; border-collapse: collapse; background: white; margin: 20px 0; }
          th, td { padding: 8px; text-align: left; border: 1px solid #ddd; font-size: 13px; }
          th { background-color: #f9fafb; font-weight: 600; }
          .btn { background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; }
          .info-box { background: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin: 20px 0; }
          .stat-card { background: #f8f9fa; padding: 15px; border-radius: 8px; text-align: center; border-left: 4px solid #007bff; }
          .stat-number { font-size: 24px; font-weight: bold; color: #333; }
          .stat-label { font-size: 12px; color: #666; text-transform: uppercase; margin-top: 5px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>👥 Customer Management Dashboard</h1>
          
          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-number">${customers.length}</div>
              <div class="stat-label">Total Customers</div>
            </div>
            <div class="stat-card" style="border-left-color: #28a745;">
              <div class="stat-number">${connectedCustomers}</div>
              <div class="stat-label">Fully Connected</div>
            </div>
            <div class="stat-card" style="border-left-color: #4285f4;">
              <div class="stat-number">${googleOnlyCustomers}</div>
              <div class="stat-label">Google Only</div>
            </div>
            <div class="stat-card" style="border-left-color: #0077C5;">
              <div class="stat-number">${qbOnlyCustomers}</div>
              <div class="stat-label">QuickBooks Only</div>
            </div>
          </div>
          
          <div class="info-box">
            <h3>🔗 Integration Status Overview</h3>
            <p><strong>Fully Connected:</strong> Customers with both Google and QuickBooks authorization</p>
            <p><strong>Available Integrations:</strong></p>
            <ul style="text-align: left;">
              <li><strong>Google Workspace:</strong> Sheets, Gmail, Calendar, Contacts, Drive</li>
              <li><strong>QuickBooks:</strong> Accounting data access (Environment: ${QB_ENVIRONMENT})</li>
            </ul>
          </div>
          
          <table>
            <thead>
              <tr>
                <th>Customer ID</th>
                <th>Email</th>
                <th>Name</th>
                <th>Google Status</th>
                <th>QuickBooks Status</th>
                <th>Registered</th>
                <th>API Integration</th>
              </tr>
            </thead>
            <tbody>
              ${customerRows.join('')}
            </tbody>
          </table>
          
          <div class="info-box">
            <h3>🔧 N8N Integration Guide</h3>
            <ol>
              <li><strong>Copy Customer ID</strong> from the table above</li>
              <li><strong>Google API:</strong> Use <code>GET /api/customer/{id}</code> for Google tokens</li>
              <li><strong>QuickBooks API:</strong> Use <code>GET /api/customer/{id}/quickbooks/tokens</code> for QB tokens</li>
              <li><strong>Status Check:</strong> Use <code>GET /api/customer/{id}/quickbooks</code> to verify QB connection</li>
            </ol>
            
            <h4>Environment Variables Needed:</h4>
            <ul style="font-family: monospace; font-size: 13px; background: #f8f9fa; padding: 15px; border-radius: 6px;">
              <li>QB_CLIENT_ID_PROD=your_production_app_id</li>
              <li>QB_CLIENT_SECRET_PROD=your_production_app_secret</li>
              <li>QB_CLIENT_ID_SANDBOX=your_sandbox_app_id</li>
              <li>QB_CLIENT_SECRET_SANDBOX=your_sandbox_app_secret</li>
              <li>QB_ENVIRONMENT=production (or sandbox for testing)</li>
            </ul>
          </div>
          
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 20px;">
            <a href="/" class="btn">← Back to Portal</a>
            <a href="/logout" class="btn" style="background: #dc3545; color: white;" onclick="return confirm('Are you sure you want to logout?')">
              🚪 Logout
            </a>
          </div>
        </div>
        
        <script>
          function copyToClipboard(text) {
            if (text === 'N/A') {
              alert('No token available');
              return;
            }
            navigator.clipboard.writeText(text).then(() => {
              alert('Copied to clipboard!');
            }).catch(err => {
              const textArea = document.createElement('textarea');
              textArea.value = text;
              document.body.appendChild(textArea);
              textArea.select();
              document.execCommand('copy');
              document.body.removeChild(textArea);
              alert('Copied to clipboard!');
            });
          }

          async function deleteCustomer(customerId, customerEmail) {
            if (!confirm(\`Are you sure you want to delete customer: \${customerEmail}?\\n\\nCustomer ID: \${customerId}\\n\\nThis action cannot be undone.\`)) {
              return;
            }
            
            try {
              const response = await fetch(\`/admin/customer/\${customerId}\`, {
                method: 'DELETE',
                headers: {
                  'Content-Type': 'application/json'
                }
              });
              
              const result = await response.json();
              
              if (response.ok) {
                alert(\`Customer \${result.customerEmail} deleted successfully!\`);
                location.reload();
              } else {
                alert('Failed to delete customer: ' + result.error);
              }
            } catch (error) {
              alert('Error deleting customer: ' + error.message);
            }
          }
        </script>
      </body>
      </html>
    `);
  } catch (error) {
    res.status(500).send('Error loading customers: ' + error.message);
  }
});

module.exports = router;