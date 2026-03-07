const { AsyncLocalStorage } = require('async_hooks');
const { v4: uuidv4 } = require('uuid');

const asyncLocalStorage = new AsyncLocalStorage();

function tracingMiddleware(req, res, next) {
  const correlationId = req.headers['x-correlation-id'] || uuidv4();
  
  // Also attach it to the request and response headers for downstream services
  req.correlationId = correlationId;
  res.setHeader('x-correlation-id', correlationId);

  asyncLocalStorage.run(correlationId, () => {
    next();
  });
}

function getCorrelationId() {
  return asyncLocalStorage.getStore();
}

module.exports = {
  tracingMiddleware,
  getCorrelationId
};
