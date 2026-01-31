/**
 * Circuit Breaker — Per-provider 3-state machine
 * 
 * States: CLOSED → OPEN → HALF_OPEN → CLOSED
 * 
 * Tracks: error rate, timeout rate, P95 latency over sliding window.
 * Opens on any threshold breach.
 * Uses exponential backoff for cooldown in OPEN state.
 */

const pino = require('pino');
const logger = pino({ name: 'circuit-breaker' });

const STATES = {
    CLOSED: 'CLOSED',
    OPEN: 'OPEN',
    HALF_OPEN: 'HALF_OPEN'
};

class CircuitBreaker {
    constructor(name, options = {}) {
        this.name = name;
        this.state = STATES.CLOSED;

        // Thresholds
        this.errorRateThreshold = options.errorRateThreshold || 0.5;  // 50% errors → open
        this.timeoutRateThreshold = options.timeoutRateThreshold || 0.3; // 30% timeouts → open
        this.p95LatencyThreshold = options.p95LatencyThreshold || 30000; // 30s → open
        this.minSamples = options.minSamples || 5; // Minimum samples before evaluating

        // Timing
        this.windowMs = options.windowMs || 60000; // 1-minute sliding window
        this.baseCooldownMs = options.baseCooldownMs || 10000; // 10s initial cooldown
        this.maxCooldownMs = options.maxCooldownMs || 120000; // 2m max cooldown

        // State
        this.events = []; // { timestamp, success, latencyMs, timedOut }
        this.consecutiveFailures = 0;
        this.cooldownMs = this.baseCooldownMs;
        this.openedAt = null;
        this.lastProbeResult = null;
        this.lastOpenReason = null; // Why the circuit last opened
    }

    /**
     * Check if a request should be allowed through.
     * Returns: { allowed: boolean, reason: string }
     */
    canExecute() {
        this._pruneOldEvents();

        switch (this.state) {
            case STATES.CLOSED:
                return { allowed: true, reason: 'circuit closed' };

            case STATES.OPEN: {
                const elapsed = Date.now() - this.openedAt;
                if (elapsed >= this.cooldownMs) {
                    // Transition to half-open, allow single probe
                    this.state = STATES.HALF_OPEN;
                    logger.info({ breaker: this.name, cooldownMs: this.cooldownMs }, 'Circuit HALF_OPEN — sending probe');
                    return { allowed: true, reason: 'half-open probe' };
                }
                return {
                    allowed: false,
                    reason: `circuit open — retry in ${Math.ceil((this.cooldownMs - elapsed) / 1000)}s`
                };
            }

            case STATES.HALF_OPEN:
                // Only one probe at a time — reject until probe completes
                return { allowed: false, reason: 'half-open — waiting for probe result' };

            default:
                return { allowed: true, reason: 'unknown state' };
        }
    }

    /**
     * Record the outcome of a request.
     */
    recordResult(success, latencyMs, timedOut = false) {
        const event = {
            timestamp: Date.now(),
            success,
            latencyMs,
            timedOut
        };
        this.events.push(event);

        if (this.state === STATES.HALF_OPEN) {
            if (success) {
                // Probe succeeded → close circuit
                this.state = STATES.CLOSED;
                this.consecutiveFailures = 0;
                this.cooldownMs = this.baseCooldownMs; // Reset backoff
                logger.info({ breaker: this.name }, 'Circuit CLOSED — probe succeeded');
            } else {
                // Probe failed → reopen with increased cooldown
                this.state = STATES.OPEN;
                this.openedAt = Date.now();
                this.cooldownMs = Math.min(this.cooldownMs * 2, this.maxCooldownMs);
                logger.warn({ breaker: this.name, nextCooldownMs: this.cooldownMs }, 'Circuit OPEN — probe failed, backing off');
            }
            return;
        }

        // CLOSED state — evaluate thresholds
        if (success) {
            this.consecutiveFailures = 0;
        } else {
            this.consecutiveFailures++;
        }

        this._evaluate();
    }

    /**
     * Evaluate if circuit should open based on sliding window metrics.
     */
    _evaluate() {
        this._pruneOldEvents();

        if (this.events.length < this.minSamples) return;

        const total = this.events.length;
        const failures = this.events.filter(e => !e.success).length;
        const timeouts = this.events.filter(e => e.timedOut).length;
        const errorRate = failures / total;
        const timeoutRate = timeouts / total;

        // Calculate P95 latency
        const latencies = this.events.map(e => e.latencyMs).sort((a, b) => a - b);
        const p95Index = Math.ceil(total * 0.95) - 1;
        const p95Latency = latencies[Math.min(p95Index, latencies.length - 1)];

        let reason = null;
        if (errorRate >= this.errorRateThreshold) {
            reason = `error rate ${(errorRate * 100).toFixed(1)}% >= ${this.errorRateThreshold * 100}%`;
        } else if (timeoutRate >= this.timeoutRateThreshold) {
            reason = `timeout rate ${(timeoutRate * 100).toFixed(1)}% >= ${this.timeoutRateThreshold * 100}%`;
        } else if (p95Latency >= this.p95LatencyThreshold) {
            reason = `P95 latency ${p95Latency}ms >= ${this.p95LatencyThreshold}ms`;
        }

        if (reason) {
            this.state = STATES.OPEN;
            this.openedAt = Date.now();
            this.lastOpenReason = reason;
            logger.warn({ breaker: this.name, reason, errorRate, timeoutRate, p95Latency }, 'Circuit OPENED');
        }
    }

    /**
     * Remove events outside the sliding window.
     */
    _pruneOldEvents() {
        const cutoff = Date.now() - this.windowMs;
        this.events = this.events.filter(e => e.timestamp > cutoff);
    }

    /**
     * Get current metrics for observability.
     */
    getMetrics() {
        this._pruneOldEvents();
        const total = this.events.length;
        const failures = this.events.filter(e => !e.success).length;
        const timeouts = this.events.filter(e => e.timedOut).length;
        const latencies = this.events.map(e => e.latencyMs).sort((a, b) => a - b);

        // Compute remaining cooldown for operators
        let cooldownRemainingMs = 0;
        if (this.state === STATES.OPEN && this.openedAt) {
            cooldownRemainingMs = Math.max(0, this.cooldownMs - (Date.now() - this.openedAt));
        }

        return {
            name: this.name,
            state: this.state,
            totalEvents: total,
            errorRate: total > 0 ? Math.round((failures / total) * 1000) / 1000 : 0,
            timeoutRate: total > 0 ? Math.round((timeouts / total) * 1000) / 1000 : 0,
            avgLatencyMs: total > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / total) : 0,
            p95LatencyMs: total > 0 ? latencies[Math.ceil(total * 0.95) - 1] || 0 : 0,
            consecutiveFailures: this.consecutiveFailures,
            cooldownMs: this.state === STATES.OPEN ? this.cooldownMs : 0,
            cooldownRemainingMs,
            lastOpenReason: this.lastOpenReason
        };
    }
}

// ────────────────────────────────────────────
// Circuit Breaker Registry
// ────────────────────────────────────────────
const breakers = new Map();

function getBreaker(providerName, options = {}) {
    if (!breakers.has(providerName)) {
        breakers.set(providerName, new CircuitBreaker(providerName, options));
    }
    return breakers.get(providerName);
}

function getAllBreakerMetrics() {
    const result = {};
    for (const [name, breaker] of breakers) {
        result[name] = breaker.getMetrics();
    }
    return result;
}

/**
 * Pre-initialize breakers for all known providers.
 * Called at startup so /health always shows circuit breaker state,
 * not an empty {}.
 */
function initializeBreakers(providerNames) {
    for (const name of providerNames) {
        if (!breakers.has(name)) {
            breakers.set(name, new CircuitBreaker(name));
            logger.info({ breaker: name }, 'Circuit breaker initialized');
        }
    }
}

module.exports = { CircuitBreaker, getBreaker, getAllBreakerMetrics, initializeBreakers, STATES };
