// ========================================
// FILE: config/database.js
// ========================================

const sqlite3 = require('sqlite3').verbose();

// Create db instance OUTSIDE the function
const dbPath = process.env.DATABASE_PATH || './data/customers.db';
const db = new sqlite3.Database(dbPath);

function initializeDatabase() {
  console.log('🗄️  Initializing database...');

  // Create tables if they don't exist
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE,
      name TEXT,
      picture TEXT,
      google_access_token TEXT,
      google_refresh_token TEXT,
      scopes TEXT,
      token_expiry DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
  });

  // Add QuickBooks columns to existing customers table
  db.serialize(() => {
    db.run(`ALTER TABLE customers ADD COLUMN qb_access_token TEXT`, (err) => {
      if (err && !err.message.includes('duplicate column')) console.log('QB access token column exists');
    });

    db.run(`ALTER TABLE customers ADD COLUMN qb_refresh_token TEXT`, (err) => {
      if (err && !err.message.includes('duplicate column')) console.log('QB refresh token column exists');
    });

    db.run(`ALTER TABLE customers ADD COLUMN qb_company_id TEXT`, (err) => {
      if (err && !err.message.includes('duplicate column')) console.log('QB company ID column exists');
    });

    db.run(`ALTER TABLE customers ADD COLUMN qb_token_expiry DATETIME`, (err) => {
      if (err && !err.message.includes('duplicate column')) console.log('QB token expiry column exists');
    });

    db.run(`ALTER TABLE customers ADD COLUMN qb_base_url TEXT`, (err) => {
      if (err && !err.message.includes('duplicate column')) console.log('QB base URL column exists');
    });
  });

  console.log('✅ Database initialization complete');
}

module.exports = { initializeDatabase, db };