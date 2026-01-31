/**
 * Benchmarker — Passive-first latency & reliability tracking
 * 
 * Measures from real traffic (rolling P50/P95/P99).
 * Active benchmarking only on startup or manual admin trigger.
 * Updates model_health table in DB.
 */

const pino = require('pino');
const logger = pino({ name: 'benchmarker' });

class Benchmarker {
    constructor(db) {
        this.db = db;

        // Per-model latency history (sliding window)
        this.latencyHistory = new Map(); // modelId → number[]
        this.errorHistory = new Map();   // modelId → { success: number, failure: number, timeout: number }
        this.windowSize = 100;           // Keep last 100 measurements

        this._flushInterval = null;
    }

    /**
     * Record a request result for passive benchmarking.
     */
    record(modelId, latencyMs, success, timedOut = false) {
        // Latency
        if (!this.latencyHistory.has(modelId)) {
            this.latencyHistory.set(modelId, []);
        }
        const latencies = this.latencyHistory.get(modelId);
        latencies.push(latencyMs);
        if (latencies.length > this.windowSize) {
            latencies.shift();
        }

        // Error tracking
        if (!this.errorHistory.has(modelId)) {
            this.errorHistory.set(modelId, { success: 0, failure: 0, timeout: 0 });
        }
        const errors = this.errorHistory.get(modelId);
        if (success) {
            errors.success++;
        } else if (timedOut) {
            errors.timeout++;
        } else {
            errors.failure++;
        }
    }

    /**
     * Get computed metrics for a model.
     */
    getMetrics(modelId) {
        const latencies = this.latencyHistory.get(modelId) || [];
        const errors = this.errorHistory.get(modelId) || { success: 0, failure: 0, timeout: 0 };
        const total = errors.success + errors.failure + errors.timeout;

        if (latencies.length === 0) {
            return {
                modelId,
                avgLatencyMs: null,
                p50LatencyMs: null,
                p95LatencyMs: null,
                p99LatencyMs: null,
                errorRate: 0,
                timeoutRate: 0,
                sampleCount: 0
            };
        }

        const sorted = [...latencies].sort((a, b) => a - b);
        const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;

        return {
            modelId,
            avgLatencyMs: Math.round(avg),
            p50LatencyMs: sorted[Math.floor(sorted.length * 0.5)],
            p95LatencyMs: sorted[Math.ceil(sorted.length * 0.95) - 1] || sorted[sorted.length - 1],
            p99LatencyMs: sorted[Math.ceil(sorted.length * 0.99) - 1] || sorted[sorted.length - 1],
            errorRate: total > 0 ? Math.round((errors.failure / total) * 1000) / 1000 : 0,
            timeoutRate: total > 0 ? Math.round((errors.timeout / total) * 1000) / 1000 : 0,
            sampleCount: sorted.length
        };
    }

    /**
     * Get metrics for all tracked models.
     */
    getAllMetrics() {
        const result = {};
        for (const modelId of this.latencyHistory.keys()) {
            result[modelId] = this.getMetrics(modelId);
        }
        return result;
    }

    /**
     * Flush metrics to DB (periodic).
     */
    flushToDB() {
        for (const modelId of this.latencyHistory.keys()) {
            const metrics = this.getMetrics(modelId);
            if (metrics.sampleCount === 0) continue;

            try {
                this.db.statements.upsertModelHealth.run({
                    model_id: modelId,
                    is_healthy: metrics.errorRate < 0.5 ? 1 : 0,
                    avg_latency_ms: metrics.avgLatencyMs,
                    p95_latency_ms: metrics.p95LatencyMs,
                    p99_latency_ms: metrics.p99LatencyMs,
                    error_rate: metrics.errorRate,
                    timeout_rate: metrics.timeoutRate,
                    success_count: this.errorHistory.get(modelId)?.success || 0,
                    failure_count: this.errorHistory.get(modelId)?.failure || 0
                });
            } catch (err) {
                logger.error({ err: err.message, modelId }, 'Failed to flush model health to DB');
            }
        }
    }

    /**
     * Start periodic DB flush (every 30 seconds).
     */
    startPeriodicFlush() {
        this._flushInterval = setInterval(() => {
            this.flushToDB();
        }, 30000);
        logger.info('Benchmarker periodic flush started (30s interval)');
    }

    /**
     * Stop periodic flush.
     */
    stop() {
        if (this._flushInterval) {
            clearInterval(this._flushInterval);
            this._flushInterval = null;
        }
    }
}

module.exports = Benchmarker;
