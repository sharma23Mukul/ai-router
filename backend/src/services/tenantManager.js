/**
 * Tenant Manager — Multi-tenant API key, quotas, policies
 * 
 * API keys are SHA-256 hashed in storage.
 * Rate limits enforced via token bucket (in middleware).
 * Per-tenant routing policies, model allowlists, and budget caps.
 */

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const pino = require('pino');
const logger = pino({ name: 'tenant-manager' });

class TenantManager {
    constructor(db) {
        this.db = db;
        this.tenantCache = new Map(); // keyHash → tenant (in-memory cache)
    }

    /**
     * Hash an API key for storage.
     */
    _hashKey(apiKey) {
        return crypto.createHash('sha256').update(apiKey).digest('hex');
    }

    /**
     * Generate a new API key.
     */
    _generateApiKey() {
        return `fra_${crypto.randomBytes(32).toString('hex')}`;
    }

    /**
     * Create a new tenant. Returns { tenant, apiKey } (apiKey shown once only).
     */
    createTenant(name, config = {}) {
        const id = uuidv4();
        const apiKey = this._generateApiKey();
        const apiKeyHash = this._hashKey(apiKey);

        const tenant = {
            id,
            api_key_hash: apiKeyHash,
            name,
            strategy: config.strategy || 'cost-first',
            allowed_models: config.allowedModels ? JSON.stringify(config.allowedModels) : null,
            budget_limit_monthly: config.budgetLimitMonthly || null,
            rate_limit_rpm: config.rateLimitRpm || 60,
            rate_limit_tpm: config.rateLimitTpm || 100000
        };

        this.db.statements.insertTenant.run(tenant);
        this.tenantCache.delete(apiKeyHash); // Invalidate cache

        logger.info({ tenantId: id, name }, 'Tenant created');

        return {
            tenant: {
                id,
                name,
                strategy: tenant.strategy,
                rateLimitRpm: tenant.rate_limit_rpm,
                rateLimitTpm: tenant.rate_limit_tpm,
                budgetLimitMonthly: tenant.budget_limit_monthly
            },
            apiKey // Show once
        };
    }

    /**
     * Authenticate a request by API key.
     * Returns: tenant object or null.
     */
    authenticate(apiKey) {
        if (!apiKey) return null;

        const hash = this._hashKey(apiKey);

        // Check cache
        if (this.tenantCache.has(hash)) {
            return this.tenantCache.get(hash);
        }

        // DB lookup
        const tenant = this.db.statements.getTenantByKeyHash.get(hash);
        if (tenant) {
            // Parse JSON fields
            tenant.allowedModels = tenant.allowed_models ? JSON.parse(tenant.allowed_models) : null;
            this.tenantCache.set(hash, tenant);
            return tenant;
        }

        return null;
    }

    /**
     * Get all tenants (admin view, no API keys).
     */
    getAllTenants() {
        return this.db.statements.getAllTenants.all().map(t => ({
            ...t,
            allowedModels: t.allowed_models ? JSON.parse(t.allowed_models) : null
        }));
    }

    /**
     * Track usage for a tenant after a request.
     */
    trackUsage(tenantId, cost) {
        if (!tenantId) return;
        this.db.statements.updateTenantUsage.run({ id: tenantId, cost });

        // Invalidate cache for this tenant to pick up updated usage
        for (const [hash, tenant] of this.tenantCache) {
            if (tenant.id === tenantId) {
                this.tenantCache.delete(hash);
                break;
            }
        }
    }

    /**
     * Check if tenant is within budget.
     */
    isWithinBudget(tenant) {
        if (!tenant || !tenant.budget_limit_monthly) return true;
        return (tenant.usage_this_month || 0) < tenant.budget_limit_monthly;
    }

    /**
     * Check if a model is allowed for this tenant.
     */
    isModelAllowed(tenant, modelId) {
        if (!tenant || !tenant.allowedModels) return true; // No restriction
        return tenant.allowedModels.includes(modelId);
    }

    /**
     * Clear in-memory cache (e.g., on config reload).
     */
    clearCache() {
        this.tenantCache.clear();
        logger.info('Tenant cache cleared');
    }
}

module.exports = TenantManager;
