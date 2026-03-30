const path = require('path');
const { logger } = require('@librechat/data-schemas');
const { loadServiceKey, isUserProvided } = require('@librechat/api');
const { config } = require('./EndpointService');

async function loadAsyncEndpoints() {
  const { googleKey } = config;
  const googleAllowUserProvide = process.env.GOOGLE_USER_PROVIDE === 'true';
  let serviceKey;
  let googleUserProvides = googleAllowUserProvide;
  let adminKeyAvailable = false;

  /** Check if GOOGLE_KEY is provided at all(including 'user_provided') */
  const isGoogleKeyProvided = googleKey && googleKey.trim() !== '';

  if (isGoogleKeyProvided) {
    /** If GOOGLE_KEY is provided, check if it's user_provided */
    googleUserProvides = googleAllowUserProvide || isUserProvided(googleKey);
    adminKeyAvailable = !isUserProvided(googleKey);
  } else {
    /** Only attempt to load service key if GOOGLE_KEY is not provided */
    const serviceKeyPath =
      process.env.GOOGLE_SERVICE_KEY_FILE || path.join(__dirname, '../../..', 'data', 'auth.json');

    try {
      serviceKey = await loadServiceKey(serviceKeyPath);
      adminKeyAvailable = Boolean(serviceKey);
    } catch (error) {
      logger.error('Error loading service key', error);
      serviceKey = null;
    }
  }

  const google =
    serviceKey || isGoogleKeyProvided || googleAllowUserProvide
      ? { userProvide: googleUserProvides, adminKeyAvailable }
      : false;

  return { google };
}

module.exports = loadAsyncEndpoints;
