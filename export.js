const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

// Update this path to match your database location
const dbPath = './data/customers.db';
const outputPath = './customers_export.csv';

const db = new sqlite3.Database(dbPath);

async function exportToCSV() {
  return new Promise((resolve, reject) => {
    // Get all customers
    db.all('SELECT * FROM customers ORDER BY created_at DESC', (err, rows) => {
      if (err) {
        reject(err);
        return;
      }

      if (rows.length === 0) {
        console.log('No customers found in database');
        resolve();
        return;
      }

      // Get column headers from the first row
      const headers = Object.keys(rows[0]);
      
      // Create CSV content
      let csvContent = headers.join(',') + '\n';
      
      // Add data rows
      rows.forEach(row => {
        const values = headers.map(header => {
          let value = row[header];
          
          // Handle null values
          if (value === null || value === undefined) {
            value = '';
          }
          
          // Escape commas and quotes in values
          if (typeof value === 'string') {
            if (value.includes(',') || value.includes('"') || value.includes('\n')) {
              value = '"' + value.replace(/"/g, '""') + '"';
            }
          }
          
          return value;
        });
        
        csvContent += values.join(',') + '\n';
      });

      // Write to file
      fs.writeFileSync(outputPath, csvContent);
      
      console.log(`✅ Exported ${rows.length} customers to ${outputPath}`);
      console.log('📊 Columns exported:', headers.join(', '));
      
      // Show sample of exported data
      console.log('\n📋 Sample data:');
      rows.slice(0, 3).forEach((row, index) => {
        console.log(`Customer ${index + 1}:`, {
          id: row.id,
          email: row.email,
          name: row.name,
          hasGoogle: !!row.google_access_token,
          hasQB: !!row.qb_access_token,
          created: row.created_at
        });
      });
      
      resolve();
    });
  });
}

// Run the export
exportToCSV()
  .then(() => {
    console.log('\n🎉 Export completed successfully!');
    console.log('Next steps:');
    console.log('1. Open Airtable and create a new base');
    console.log('2. Import the CSV file: customers_export.csv');
    console.log('3. Map the columns appropriately');
    console.log('4. Update your Node.js app to use Airtable API');
    db.close();
  })
  .catch(error => {
    console.error('❌ Export failed:', error);
    db.close();
  });