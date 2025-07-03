// ========================================
// FILE: config/passport.js
// ========================================

const GoogleStrategy = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const { v4: uuidv4 } = require('uuid');
const { storeCustomer, getCustomerById, getAllCustomers } = require('../utils/database');

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

function configurePassport(passport) {
  console.log('🔧 Configuring Passport strategies...');

  // Google Strategy
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "https://auth.robosouthla.com/auth/google/callback",
    scope: REQUIRED_SCOPES,
    accessType: 'offline',
    prompt: 'consent'
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      const userEmail = profile.emails[0].value;
      console.log('🔍 Google OAuth for email:', userEmail);

      // STEP 1: Check if a customer with this email already exists
      const existingCustomers = await getAllCustomers();
      const existingCustomer = existingCustomers.find(c => c.email === userEmail);

      if (existingCustomer) {
        // STEP 2: Customer exists - UPDATE their Google tokens but PRESERVE QuickBooks data
        console.log('✅ Found existing customer, merging Google auth:', existingCustomer.id);

        const mergedCustomerData = {
          id: existingCustomer.id,
          email: userEmail,
          name: profile.displayName,
          picture: profile.photos?.[0]?.value || null,
          accessToken,
          refreshToken,
          scopes: REQUIRED_SCOPES.join(' '),
          tokenExpiry: new Date(Date.now() + (3600 * 1000)),

          // PRESERVE EXISTING QUICKBOOKS DATA
          qbAccessToken: existingCustomer.qb_access_token,
          qbRefreshToken: existingCustomer.qb_refresh_token,
          qbCompanyId: existingCustomer.qb_company_id,
          qbTokenExpiry: existingCustomer.qb_token_expiry,
          qbBaseUrl: existingCustomer.qb_base_url
        };

        await storeCustomer(mergedCustomerData);
        console.log('🎉 Merged Google auth with existing customer (QB preserved):', userEmail);

        return done(null, mergedCustomerData);
      } else {
        // STEP 3: New customer - create fresh record
        const customerId = uuidv4();
        const customerData = {
          id: customerId,
          email: userEmail,
          name: profile.displayName,
          picture: profile.photos?.[0]?.value || null,
          accessToken,
          refreshToken,
          scopes: REQUIRED_SCOPES.join(' '),
          tokenExpiry: new Date(Date.now() + (3600 * 1000))
        };

        await storeCustomer(customerData);
        console.log('✅ New Google customer created:', userEmail, customerId);

        return done(null, customerData);
      }

    } catch (error) {
      console.error('❌ Google OAuth error:', error);
      return done(error, null);
    }
  }));

  // Facebook Strategy
  passport.use(new FacebookStrategy({
    clientID: process.env.FB_APP_ID,
    clientSecret: process.env.FB_APP_SECRET,
    callbackURL: "https://auth.robosouthla.com/auth/facebook/callback",
    profileFields: ['id', 'emails', 'name', 'picture.type(large)']
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      const email = profile.emails?.[0]?.value || `fb_${profile.id}@facebook.com`;
      const userId = `fb_${profile.id}`;

      const customerData = {
        id: userId,
        email,
        name: `${profile.name.givenName} ${profile.name.familyName}`,
        picture: profile.photos?.[0]?.value,
        accessToken,
        refreshToken,
        scopes: 'facebook'
      };

      await storeCustomer(customerData);
      return done(null, customerData);
    } catch (err) {
      console.error('❌ Facebook OAuth error:', err);
      return done(err, null);
    }
  }));

  passport.serializeUser((user, done) => {
    console.log('🔄 Serializing user:', user.email);
    done(null, user.id);
  });

  passport.deserializeUser(async (id, done) => {
    try {
      console.log('🔄 Deserializing user ID:', id);
      const customer = await getCustomerById(id);
      if (customer) {
        console.log('✅ Deserialized user:', customer.email);
      } else {
        console.log('❌ User not found during deserialization:', id);
      }
      done(null, customer);
    } catch (error) {
      console.error('❌ Deserialization error:', error);
      done(error, null);
    }
  });

  console.log('✅ Passport configuration complete');
}

module.exports = { configurePassport, REQUIRED_SCOPES };