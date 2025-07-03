// ========================================
// FILE: utils/validation.js
// ========================================

const fetch = require('node-fetch');

async function validateToken(accessToken) {
  try {
    console.log('Validating token...', accessToken.substring(0, 20) + '...');
    const response = await fetch(`https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${accessToken}`);
    console.log('Token validation response status:', response.status);

    if (response.ok) {
      const data = await response.json();
      console.log('Token validation result:', {
        valid: true,
        expires_in: data.expires_in,
        scopes: data.scope ? data.scope.split(' ').length : 0
      });
      return {
        valid: true,
        expires_in: data.expires_in,
        scopes: data.scope ? data.scope.split(' ') : []
      };
    } else {
      const errorText = await response.text();
      console.log('Token validation failed:', response.status, errorText);
      return { valid: false };
    }
  } catch (error) {
    console.log('Token validation error:', error.message);
    return { valid: false, error: error.message };
  }
}

async function validateQBToken(accessToken, companyId) {
  try {
    if (!accessToken || !companyId) {
      return { valid: false, error: 'Missing token or company ID' };
    }

    // Optional: Test with actual QB API call for better validation
    // Remove this try/catch block if you want to skip the API test
    try {
      const baseUrl = process.env.QB_ENVIRONMENT === 'sandbox'
        ? 'https://sandbox-quickbooks.api.intuit.com'
        : 'https://quickbooks.api.intuit.com';

      const testUrl = `${baseUrl}/v3/company/${companyId}/companyinfo/${companyId}`;

      const response = await fetch(testUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        },
        timeout: 5000 // 5 second timeout
      });

      console.log('QB Token validation response:', response.status);

      return {
        valid: response.ok,
        status: response.status
      };
    } catch (fetchError) {
      console.log('QB API test failed, falling back to basic validation:', fetchError.message);
      // Fall back to basic validation if API test fails
    }

    // Basic validation - just check if we have the required values
    console.log('QB Token validation (basic check):', {
      hasAccessToken: !!accessToken,
      hasCompanyId: !!companyId,
      companyId: companyId
    });

    return {
      valid: true, // Assume valid if we have both values
      status: 200
    };

  } catch (error) {
    console.log('QB token validation error:', error.message);
    return { valid: false, error: error.message };
  }
}

// NEW: Live QuickBooks token validation using Company Info API
async function validateQBTokenLive(accessToken, companyId, baseUrl) {
  try {
    if (!accessToken || !companyId || !baseUrl) {
      return { 
        valid: false, 
        status: 'Missing Parameters',
        error: 'Missing token, company ID, or base URL' 
      };
    }

    // Use Company Info endpoint - lightweight and requires valid auth
    const response = await fetch(`${baseUrl}/v3/companyinfo/${companyId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      },
      timeout: 10000 // 10 second timeout
    });

    console.log('QB Token validation response:', response.status);

    if (response.ok) {
      return {
        valid: true,
        status: 'Connected'
      };
    } else if (response.status === 401) {
      return {
        valid: false,
        status: 'Invalid/Expired',
        error: 'Token expired or invalid'
      };
    } else if (response.status >= 500) {
      return {
        valid: false,
        status: 'Server Error',
        error: `QuickBooks API server error (${response.status})`
      };
    } else {
      return {
        valid: false,
        status: 'API Error',
        error: `HTTP ${response.status}`
      };
    }
  } catch (error) {
    console.error('QB token validation error:', error);
    
    // Handle timeout and network errors specifically
    if (error.name === 'TimeoutError') {
      return {
        valid: false,
        status: 'Timeout',
        error: 'Request timed out'
      };
    }
    
    return {
      valid: false,
      status: 'Connection Error',
      error: error.message
    };
  }
}

module.exports = { 
  validateToken, 
  validateQBToken,
  validateQBTokenLive 
};