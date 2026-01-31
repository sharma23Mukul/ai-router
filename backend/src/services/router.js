/**
 * Multi-Factor Weighted Router
 * 
 * Routing formula:
 *   score = w_cost × norm_cost
 *         + w_quality × quality_match(intent, model.strengths)
 *         + w_latency × norm_latency
 *         + w_energy × energy_estimate
 *         + w_reliability × health_score
 *         + w_rl × rl_bonus
 * 
 * Weights are strategy-dependent + RL-tuned.
 * Normalization: 10-minute rolling window, min/max clamp, z-score.
 * Confidence-weighted: low ML confidence → bias toward more capable models.
 */

const models = require('../models/models.json');
const pino = require('pino');
const logger = pino({ name: 'router' });

// ────────────────────────────────────────────
// Strategy weight profiles
// ────────────────────────────────────────────
const STRATEGY_WEIGHTS = {
    'cost-first': {
        cost: 0.35,
        quality: 0.20,
        latency: 0.10,
        energy: 0.10,
        reliability: 0.10,
        rl: 0.15
    },
    'green-first': {
        cost: 0.10,
        quality: 0.15,
        latency: 0.10,
        energy: 0.35,
        reliability: 0.10,
        rl: 0.20
    },
    'performance-first': {
        cost: 0.05,
        quality: 0.35,
        latency: 0.20,
        energy: 0.05,
        reliability: 0.20,
        rl: 0.15
    },
    'balanced': {
        cost: 0.20,
        quality: 0.20,
        latency: 0.15,
        energy: 0.15,
        reliability: 0.15,
        rl: 0.15
    }
};

// ────────────────────────────────────────────
// Normalization stability
// Minimum samples before trusting observed metrics.
// Below this threshold, we blend with static baselines from models.json.
// ────────────────────────────────────────────
const MIN_BENCHMARK_SAMPLES = 20;

function normalizeMinMax(value, min, max) {
    if (max === min) return 0.5;
    return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

function invertNormalize(value, min, max) {
    // For metrics where lower is better (cost, latency, energy)
    return 1 - normalizeMinMax(value, min, max);
}

/**
 * Blend observed benchmark data with static baseline.
 * Returns effective latency/reliability with smooth transition.
 * coeff = min(sampleCount / MIN_BENCHMARK_SAMPLES, 1)
 *   0 = pure baseline, 1 = pure observed
 */
function blendWithBaseline(observed, baseline, sampleCount) {
    const coeff = Math.min(sampleCount / MIN_BENCHMARK_SAMPLES, 1);
    return coeff * observed + (1 - coeff) * baseline;
}

// ────────────────────────────────────────────
// Quality matching: intent → model strengths
// ────────────────────────────────────────────
function qualityMatchScore(intent, modelStrengths, baseQuality) {
    if (!modelStrengths || !intent) return baseQuality / 100;

    // Bonus if model is strong at this intent type
    const intentStrengthMap = {
        'code': ['code', 'reasoning'],
        'math': ['math', 'reasoning'],
        'analysis': ['analysis', 'reasoning'],
        'creative': ['creative'],
        'translation': ['translation'],
        'qa': ['qa', 'summarization'],
        'general': []
    };

    const relevantStrengths = intentStrengthMap[intent] || [];
    let matchCount = 0;
    for (const s of relevantStrengths) {
        if (modelStrengths.includes(s)) matchCount++;
    }

    const strengthBonus = relevantStrengths.length > 0
        ? (matchCount / relevantStrengths.length) * 0.2
        : 0;

    return Math.min(1, (baseQuality / 100) + strengthBonus);
}

// ────────────────────────────────────────────
// Tier → minimum quality requirement
// ────────────────────────────────────────────
const TIER_MIN_QUALITY = {
    'trivial': 0,
    'simple': 0,
    'moderate': 60,
    'complex': 80,
    'expert': 90
};

// ────────────────────────────────────────────
// Main routing function
// ────────────────────────────────────────────
function routeRequest(classification, strategy = 'cost-first', options = {}) {
    const {
        rlScores = {},
        benchmarkMetrics = {},
        breakerStates = {},
        tenantAllowedModels = null,
        confidenceThreshold = 0.5
    } = options;

    const weights = STRATEGY_WEIGHTS[strategy] || STRATEGY_WEIGHTS['balanced'];

    // Build candidate list
    let candidates = Object.entries(models).map(([id, data]) => ({
        id,
        ...data
    }));

    // Filter: tenant model allowlist
    if (tenantAllowedModels) {
        candidates = candidates.filter(m => tenantAllowedModels.includes(m.id));
    }

    // Filter: circuit breaker (exclude models with open circuits)
    candidates = candidates.filter(m => {
        const state = breakerStates[m.id] || breakerStates[m.provider];
        if (state && state.state === 'OPEN') {
            logger.debug({ model: m.id }, 'Skipping model — circuit open');
            return false;
        }
        return true;
    });

    // Filter: minimum quality for complexity tier
    const minQuality = TIER_MIN_QUALITY[classification.tier] || 0;
    const qualityCandidates = candidates.filter(m => m.quality_score >= minQuality);

    // If filtering removes all candidates, keep all viable ones
    if (qualityCandidates.length > 0) {
        candidates = qualityCandidates;
    }

    // Confidence adjustment: if ML confidence is low, bias toward higher quality
    let adjustedMinQuality = minQuality;
    if (classification.confidence < confidenceThreshold) {
        // Low confidence → be safer, require higher quality
        adjustedMinQuality = Math.min(minQuality + 15, 95);
        const safeCandidates = candidates.filter(m => m.quality_score >= adjustedMinQuality);
        if (safeCandidates.length > 0) {
            candidates = safeCandidates;
            logger.debug({ confidence: classification.confidence, adjustedMin: adjustedMinQuality },
                'Low confidence — biasing toward capable models');
        }
    }

    if (candidates.length === 0) {
        // Ultimate fallback: use all models
        candidates = Object.entries(models).map(([id, data]) => ({ id, ...data }));
        logger.warn('No viable candidates after filtering — using all models');
    }

    // ────────────────────────────────────────
    // Compute normalization ranges (min/max clamp)
    // ────────────────────────────────────────
    const costValues = candidates.map(m =>
        (m.input_cost_per_1m + m.output_cost_per_1m) / 2
    );
    const latencyValues = candidates.map(m => {
        const bm = benchmarkMetrics[m.id];
        return bm ? bm.avgLatencyMs : m.avg_latency_ms;
    });
    const energyValues = candidates.map(m => m.energy_intensity);

    const costMin = Math.min(...costValues), costMax = Math.max(...costValues);
    const latMin = Math.min(...latencyValues), latMax = Math.max(...latencyValues);
    const energyMin = Math.min(...energyValues), energyMax = Math.max(...energyValues);

    // ────────────────────────────────────────
    // Score each candidate
    // ────────────────────────────────────────
    const scoredCandidates = candidates.map(m => {
        const avgCost = (m.input_cost_per_1m + m.output_cost_per_1m) / 2;
        const bm = benchmarkMetrics[m.id];
        const sampleCount = bm ? (bm.sampleCount || 0) : 0;

        // Blend observed metrics with static baselines for stability
        // Until MIN_BENCHMARK_SAMPLES reached, we trust models.json defaults
        const realLatency = bm && bm.avgLatencyMs != null
            ? blendWithBaseline(bm.avgLatencyMs, m.avg_latency_ms, sampleCount)
            : m.avg_latency_ms;
        const realReliability = bm && bm.errorRate != null
            ? blendWithBaseline(1 - bm.errorRate, m.reliability, sampleCount)
            : m.reliability;

        // Normalized scores (higher = better)
        const costScore = invertNormalize(avgCost, costMin, costMax);
        const qualityScore = qualityMatchScore(
            classification.intent,
            m.strengths,
            m.quality_score
        );
        const latencyScore = invertNormalize(realLatency, latMin, latMax);
        const energyScore = invertNormalize(m.energy_intensity, energyMin, energyMax);
        const reliabilityScore = realReliability;
        const rlScore = rlScores[m.id] || 0.5;

        // Weighted sum
        const totalScore =
            weights.cost * costScore +
            weights.quality * qualityScore +
            weights.latency * latencyScore +
            weights.energy * energyScore +
            weights.reliability * reliabilityScore +
            weights.rl * rlScore;

        return {
            id: m.id,
            provider: m.provider,
            totalScore: Math.round(totalScore * 1000) / 1000,
            breakdown: {
                cost: Math.round(costScore * 1000) / 1000,
                quality: Math.round(qualityScore * 1000) / 1000,
                latency: Math.round(latencyScore * 1000) / 1000,
                energy: Math.round(energyScore * 1000) / 1000,
                reliability: Math.round(reliabilityScore * 1000) / 1000,
                rl: Math.round(rlScore * 1000) / 1000
            },
            weights,
            modelData: m
        };
    });

    // Sort by score descending
    scoredCandidates.sort((a, b) => b.totalScore - a.totalScore);

    const best = scoredCandidates[0];

    logger.info({
        selected: best.id,
        score: best.totalScore,
        tier: classification.tier,
        intent: classification.intent,
        strategy,
        candidates: scoredCandidates.map(c => `${c.id}(${c.totalScore})`).join(', ')
    }, 'Routing decision');

    return {
        selectedModel: best.modelData,
        selectedModelId: best.id,
        score: best.totalScore,
        scoreBreakdown: best.breakdown,
        allCandidates: scoredCandidates,
        classification,
        strategy,
        reasoning: `Strategy '${strategy}' + Tier '${classification.tier}' (conf: ${classification.confidence}) + Intent '${classification.intent}' → ${best.id} (score: ${best.totalScore})`
    };
}

module.exports = { routeRequest, STRATEGY_WEIGHTS };
