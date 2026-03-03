/**
 * Environment configuration validator.
 * Validates variables on server startup to prevent silent failures.
 */

const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];
const ENVS = ['development', 'production', 'test'];

function validateEnv() {
  const errors = [];

  // Validate PORT
  if (process.env.PORT) {
    const port = parseInt(process.env.PORT, 10);
    if (isNaN(port) || port <= 0 || port > 65535) {
      errors.push(`PORT must be a valid port number between 1 and 65535, got "${process.env.PORT}"`);
    }
  }

  // Validate NODE_ENV
  if (process.env.NODE_ENV && !ENVS.includes(process.env.NODE_ENV)) {
    errors.push(`NODE_ENV must be one of [${ENVS.join(', ')}], got "${process.env.NODE_ENV}"`);
  }

  // Validate LOG_LEVEL
  if (process.env.LOG_LEVEL && !LOG_LEVELS.includes(process.env.LOG_LEVEL)) {
    errors.push(`LOG_LEVEL must be one of [${LOG_LEVELS.join(', ')}], got "${process.env.LOG_LEVEL}"`);
  }

  // Check API keys
  const keys = ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'GROQ_API_KEY', 'COHERE_API_KEY'];
  const configuredKeys = [];
  const placeholderKeys = [];

  for (const key of keys) {
    const val = process.env[key];
    if (val && val.trim() !== '') {
      if (val.toLowerCase().includes('your_') || val === 'placeholder') {
        placeholderKeys.push(key);
      } else {
        configuredKeys.push(key);
      }
    }
  }

  // Output warnings/errors
  if (errors.length > 0) {
    console.error('❌ Environment validation failed:');
    errors.forEach(err => console.error(`   - ${err}`));
    process.exit(1);
  }

  // If no keys configured or only placeholder keys, print a warning
  if (configuredKeys.length === 0) {
    console.warn('⚠️  WARNING: No active LLM provider API keys configured. Server will run in MOCK MODE.');
  }

  if (placeholderKeys.length > 0) {
    console.warn(`⚠️  WARNING: The following keys seem to be placeholders: [${placeholderKeys.join(', ')}]`);
  }

  return {
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    logLevel: process.env.LOG_LEVEL || 'info',
    mockMode: configuredKeys.length === 0
  };
}

module.exports = { validateEnv };
