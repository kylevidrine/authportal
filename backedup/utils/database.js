// ========================================
// FILE: utils/database.js
// ========================================

const { db } = require('../config/database');

function storeCustomer(customerData) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO customers 
      (id, email, name, picture, google_access_token, google_refresh_token, scopes, token_expiry, 
       qb_access_token, qb_refresh_token, qb_company_id, qb_token_expiry, qb_base_url, updated_at) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    stmt.run([
      customerData.id,
      customerData.email,
      customerData.name,
      customerData.picture,
      customerData.accessToken,
      customerData.refreshToken,
      customerData.scopes,
      customerData.tokenExpiry,
      customerData.qbAccessToken || null,
      customerData.qbRefreshToken || null,
      customerData.qbCompanyId || null,
      customerData.qbTokenExpiry || null,
      customerData.qbBaseUrl || null
    ], function (err) {
      if (err) reject(err);
      else resolve(this.lastID);
    });

    stmt.finalize();
  });
}

function getCustomerById(id) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM customers WHERE id = ?', [id], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function getAllCustomers() {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM customers ORDER BY created_at DESC', (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function updateCustomerQBTokens(customerId, qbData) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(`
      UPDATE customers 
      SET qb_access_token = ?, qb_refresh_token = ?, qb_company_id = ?, 
          qb_token_expiry = ?, qb_base_url = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    stmt.run([
      qbData.qbAccessToken,
      qbData.qbRefreshToken,
      qbData.qbCompanyId,
      qbData.qbTokenExpiry,
      qbData.qbBaseUrl,
      customerId
    ], function (err) {
      if (err) reject(err);
      else resolve(this.changes);
    });

    stmt.finalize();
  });
}

async function updateCustomerGoogleTokens(customerId, googleData) {
  console.log('🔥 DEBUG: updateCustomerGoogleTokens called');
  console.log('🔥 DEBUG: customerId:', customerId);
  console.log('🔥 DEBUG: googleData:', JSON.stringify(googleData, null, 2));
  
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(`
      UPDATE customers 
      SET google_access_token = ?, google_refresh_token = ?, 
          token_expiry = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    const params = [
      googleData.googleAccessToken,
      googleData.googleRefreshToken,
      googleData.googleTokenExpiry.toISOString(),
      customerId
    ];
    
    console.log('🔥 DEBUG: SQL params:', params);

    stmt.run(params, function (err) {
      if (err) {
        console.error('❌ Failed to update Google tokens in database:', err);
        reject(err);
      } else {
        console.log('✅ Updated Google tokens in database for customer:', customerId, '- Rows changed:', this.changes);
        resolve(this.changes);
      }
    });

    stmt.finalize();
  });
}

module.exports = {
  storeCustomer,
  getCustomerById,
  getAllCustomers,
  updateCustomerQBTokens,
  updateCustomerGoogleTokens
};