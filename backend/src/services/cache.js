/**
 * Semantic Cache — Gated LRU with exact-match + embedding similarity
 * 
 * Strategy (per audit):
 *   Step 1: Check exact match (hash lookup, zero cost)
 *   Step 2: Only compute embedding if no exact match AND cache has >100 entries
 *   Step 3: Similarity search against cached embeddings
 *   Auto-disable embedding if hit rate < 15%
 */

const crypto = require('crypto');
const pino = require('pino');
const logger = pino({ name: 'cache' });

class SemanticCache {
    constructor(options = {}) {
        this.maxSize = options.maxSize || 10000;
        this.ttlMs = options.ttlMs || 3600000; // 1 hour
        this.similarityThreshold = options.similarityThreshold || 0.92;
        this.minEntriesForEmbedding = options.minEntriesForEmbedding || 100;
        this.minHitRateForEmbedding = options.minHitRateForEmbedding || 0.15;

        // Storage
        this.exactMatchMap = new Map(); // hash → { response, model, timestamp, hitCount }
        this.embeddingEntries = [];      // [{ hash, embedding, response, model, timestamp, hitCount }]
        this.accessOrder = [];           // LRU tracking (hashes)

        // Metrics
        this.stats = {
            totalLookups: 0,
            exactHits: 0,
            semanticHits: 0,
            misses: 0,
            embeddingsComputed: 0,
            embeddingsSkipped: 0
        };
    }

    /**
     * Hash a prompt for exact-match lookup.
     */
    _hash(prompt) {
        return crypto.createHash('sha256').update(prompt.trim().toLowerCase()).digest('hex').substring(0, 16);
    }

    /**
     * Check if embedding-based search should be used.
     */
    _shouldUseEmbedding() {
        if (this.exactMatchMap.size < this.minEntriesForEmbedding) return false;

        // Auto-disable if hit rate too low
        const totalHits = this.stats.exactHits + this.stats.semanticHits;
        const hitRate = this.stats.totalLookups > 50
            ? totalHits / this.stats.totalLookups
            : 1; // Give benefit of doubt until we have enough data

        if (hitRate < this.minHitRateForEmbedding) {
            this.stats.embeddingsSkipped++;
            return false;
        }

        return true;
    }

    /**
     * Cosine similarity between two vectors.
     */
    _cosineSimilarity(a, b) {
        if (!a || !b || a.length !== b.length) return 0;
        let dotProduct = 0, normA = 0, normB = 0;
        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        const denom = Math.sqrt(normA) * Math.sqrt(normB);
        return denom === 0 ? 0 : dotProduct / denom;
    }

    /**
     * Lookup a prompt in the cache.
     * Returns: { hit: boolean, response?, model?, source?: 'exact'|'semantic' }
     */
    lookup(promptHash, embedding = null) {
        this.stats.totalLookups++;
        this._evictExpired();

        // Step 1: Exact match
        const exact = this.exactMatchMap.get(promptHash);
        if (exact && Date.now() - exact.timestamp < this.ttlMs) {
            exact.hitCount++;
            this._touchLRU(promptHash);
            this.stats.exactHits++;
            logger.debug({ hash: promptHash }, 'Cache exact hit');
            return { hit: true, response: exact.response, model: exact.model, source: 'exact' };
        }

        // Step 2: Semantic search (gated)
        if (embedding && this._shouldUseEmbedding()) {
            let bestSim = 0;
            let bestEntry = null;

            for (const entry of this.embeddingEntries) {
                if (Date.now() - entry.timestamp > this.ttlMs) continue;
                const sim = this._cosineSimilarity(embedding, entry.embedding);
                if (sim > bestSim) {
                    bestSim = sim;
                    bestEntry = entry;
                }
            }

            if (bestEntry && bestSim >= this.similarityThreshold) {
                bestEntry.hitCount++;
                this._touchLRU(bestEntry.hash);
                this.stats.semanticHits++;
                logger.debug({ similarity: bestSim.toFixed(3) }, 'Cache semantic hit');
                return { hit: true, response: bestEntry.response, model: bestEntry.model, source: 'semantic' };
            }
        }

        this.stats.misses++;
        return { hit: false };
    }

    /**
     * Store a response in the cache.
     */
    store(promptHash, response, model, embedding = null) {
        // Evict if at capacity (LRU)
        while (this.exactMatchMap.size >= this.maxSize) {
            const oldestHash = this.accessOrder.shift();
            if (oldestHash) {
                this.exactMatchMap.delete(oldestHash);
                this.embeddingEntries = this.embeddingEntries.filter(e => e.hash !== oldestHash);
            }
        }

        const entry = {
            response,
            model,
            timestamp: Date.now(),
            hitCount: 0
        };

        this.exactMatchMap.set(promptHash, entry);
        this._touchLRU(promptHash);

        if (embedding) {
            this.embeddingEntries.push({
                hash: promptHash,
                embedding,
                response,
                model,
                timestamp: entry.timestamp,
                hitCount: 0
            });
            this.stats.embeddingsComputed++;
        }
    }

    /**
     * Update LRU order.
     */
    _touchLRU(hash) {
        const idx = this.accessOrder.indexOf(hash);
        if (idx !== -1) this.accessOrder.splice(idx, 1);
        this.accessOrder.push(hash);
    }

    /**
     * Remove expired entries.
     */
    _evictExpired() {
        const now = Date.now();
        for (const [hash, entry] of this.exactMatchMap) {
            if (now - entry.timestamp > this.ttlMs) {
                this.exactMatchMap.delete(hash);
                this.accessOrder = this.accessOrder.filter(h => h !== hash);
            }
        }
        this.embeddingEntries = this.embeddingEntries.filter(e => now - e.timestamp <= this.ttlMs);
    }

    /**
     * Get cache metrics.
     */
    getMetrics() {
        const totalHits = this.stats.exactHits + this.stats.semanticHits;
        return {
            size: this.exactMatchMap.size,
            maxSize: this.maxSize,
            hitRate: this.stats.totalLookups > 0
                ? Math.round((totalHits / this.stats.totalLookups) * 1000) / 1000
                : 0,
            ...this.stats,
            embeddingEnabled: this._shouldUseEmbedding()
        };
    }

    /**
     * Generate hash for external use.
     */
    hashPrompt(prompt) {
        return this._hash(prompt);
    }
}

module.exports = SemanticCache;
