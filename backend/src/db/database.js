const Database = require('better-sqlite3');
const path = require('path');
const pino = require('pino');

const logger = pino({ name: 'database' });
const dbPath = path.resolve(__dirname, '../../frugal_router.db');

let db;
try {
  db = new Database(dbPath);
  // Enable WAL mode for concurrent reads during writes
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('cache_size = -64000'); // 64MB cache
  db.pragma('busy_timeout = 5000');
  logger.info('Connected to SQLite database (WAL mode enabled)');
} catch (err) {
  logger.error({ err }, 'Failed to open database');
  process.exit(1);
}

// ────────────────────────────────────────────
// Schema: requests (expanded)
// ────────────────────────────────────────────
db.exec(`CREATE TABLE IF NOT EXISTS requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  tenant_id TEXT,
  prompt_preview TEXT,
  complexity_tier TEXT,
  complexity_score REAL,
  ml_confidence REAL,
  intent TEXT,
  model_selected TEXT,
  provider TEXT,
  strategy TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cost REAL,
  energy_intensity REAL,
  actual_latency_ms INTEGER,
  provider_status INTEGER,
  cache_hit INTEGER DEFAULT 0,
  routing_reasoning TEXT
)`);

// ────────────────────────────────────────────
// Schema: tenants
// ────────────────────────────────────────────
db.exec(`CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  api_key_hash TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  strategy TEXT DEFAULT 'cost-first',
  allowed_models TEXT, -- JSON array
  budget_limit_monthly REAL,
  rate_limit_rpm INTEGER DEFAULT 60,
  rate_limit_tpm INTEGER DEFAULT 100000,
  usage_this_month REAL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// ────────────────────────────────────────────
// Schema: routing_feedback (for RL training)
// ────────────────────────────────────────────
db.exec(`CREATE TABLE IF NOT EXISTS routing_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  tenant_id TEXT,
  quality_score REAL,
  latency_ms INTEGER,
  cost REAL,
  success INTEGER DEFAULT 1,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// ────────────────────────────────────────────
// Schema: model_health
// ────────────────────────────────────────────
db.exec(`CREATE TABLE IF NOT EXISTS model_health (
  model_id TEXT PRIMARY KEY,
  is_healthy INTEGER DEFAULT 1,
  last_check DATETIME DEFAULT CURRENT_TIMESTAMP,
  failure_count INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  avg_latency_ms REAL,
  p95_latency_ms REAL,
  p99_latency_ms REAL,
  error_rate REAL DEFAULT 0,
  timeout_rate REAL DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// ────────────────────────────────────────────
// Indexes for query performance
// ────────────────────────────────────────────
db.exec(`CREATE INDEX IF NOT EXISTS idx_requests_timestamp ON requests(timestamp)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_requests_tenant ON requests(tenant_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_requests_model ON requests(model_selected)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_feedback_model ON routing_feedback(model_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_feedback_timestamp ON routing_feedback(timestamp)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_tenants_apikey ON tenants(api_key_hash)`);

// ────────────────────────────────────────────
// Prepared statements (reusable, faster)
// ────────────────────────────────────────────
const statements = {
  insertRequest: db.prepare(`INSERT INTO requests (
    request_id, tenant_id, prompt_preview, complexity_tier, complexity_score,
    ml_confidence, intent, model_selected, provider, strategy,
    input_tokens, output_tokens, cost, energy_intensity, actual_latency_ms,
    provider_status, cache_hit, routing_reasoning
  ) VALUES (
    @request_id, @tenant_id, @prompt_preview, @complexity_tier, @complexity_score,
    @ml_confidence, @intent, @model_selected, @provider, @strategy,
    @input_tokens, @output_tokens, @cost, @energy_intensity, @actual_latency_ms,
    @provider_status, @cache_hit, @routing_reasoning
  )`),

  insertFeedback: db.prepare(`INSERT INTO routing_feedback (
    request_id, model_id, tenant_id, quality_score, latency_ms, cost, success
  ) VALUES (@request_id, @model_id, @tenant_id, @quality_score, @latency_ms, @cost, @success)`),

  upsertModelHealth: db.prepare(`INSERT INTO model_health (
    model_id, is_healthy, avg_latency_ms, p95_latency_ms, p99_latency_ms, error_rate, timeout_rate, success_count, failure_count, updated_at
  ) VALUES (@model_id, @is_healthy, @avg_latency_ms, @p95_latency_ms, @p99_latency_ms, @error_rate, @timeout_rate, @success_count, @failure_count, CURRENT_TIMESTAMP)
  ON CONFLICT(model_id) DO UPDATE SET
    is_healthy=@is_healthy, avg_latency_ms=@avg_latency_ms, p95_latency_ms=@p95_latency_ms,
    p99_latency_ms=@p99_latency_ms, error_rate=@error_rate, timeout_rate=@timeout_rate,
    success_count=@success_count, failure_count=@failure_count, updated_at=CURRENT_TIMESTAMP`),

  getRecentFeedback: db.prepare(`SELECT model_id, quality_score, latency_ms, cost, success, timestamp
    FROM routing_feedback WHERE timestamp > datetime('now', '-10 minutes')
    ORDER BY timestamp DESC LIMIT 200`),

  getRecentRequests: db.prepare(`SELECT * FROM requests ORDER BY timestamp DESC LIMIT 50`),

  getStats: db.prepare(`SELECT 
    COUNT(*) as total_requests,
    SUM(cost) as total_cost,
    SUM(energy_intensity) as total_energy,
    AVG(actual_latency_ms) as avg_latency,
    SUM(CASE WHEN cache_hit = 1 THEN 1 ELSE 0 END) as cache_hits
    FROM requests`),

  getModelStats: db.prepare(`SELECT 
    model_selected, COUNT(*) as count, AVG(cost) as avg_cost,
    AVG(actual_latency_ms) as avg_latency, AVG(ml_confidence) as avg_confidence
    FROM requests GROUP BY model_selected`),

  getTenantByKeyHash: db.prepare(`SELECT * FROM tenants WHERE api_key_hash = ?`),

  insertTenant: db.prepare(`INSERT INTO tenants (
    id, api_key_hash, name, strategy, allowed_models, budget_limit_monthly, rate_limit_rpm, rate_limit_tpm
  ) VALUES (@id, @api_key_hash, @name, @strategy, @allowed_models, @budget_limit_monthly, @rate_limit_rpm, @rate_limit_tpm)`),

  getAllTenants: db.prepare(`SELECT id, name, strategy, allowed_models, budget_limit_monthly, rate_limit_rpm, rate_limit_tpm, usage_this_month, created_at FROM tenants`),

  updateTenantUsage: db.prepare(`UPDATE tenants SET usage_this_month = usage_this_month + @cost, updated_at = CURRENT_TIMESTAMP WHERE id = @id`),

  getModelHealth: db.prepare(`SELECT * FROM model_health`),

  getFeedbackByModel: db.prepare(`SELECT model_id, 
    AVG(quality_score) as avg_quality, AVG(latency_ms) as avg_latency, 
    SUM(CASE WHEN success=1 THEN 1 ELSE 0 END) as successes,
    SUM(CASE WHEN success=0 THEN 1 ELSE 0 END) as failures,
    COUNT(*) as total
    FROM routing_feedback 
    WHERE timestamp > datetime('now', '-10 minutes')
    GROUP BY model_id`)
};

module.exports = { db, statements };
