/**
 * ML Classifier — Complexity + Intent Analysis
 * 
 * Uses ONNX Runtime for GPU-accelerated classification when available.
 * Falls back to enhanced heuristic classifier if ONNX model is not present.
 * 
 * Output: { tier, score, confidence, intent, features }
 *   tier: 'trivial' | 'simple' | 'moderate' | 'complex' | 'expert'
 *   intent: 'qa' | 'code' | 'creative' | 'analysis' | 'translation' | 'math' | 'general'
 */

const pino = require('pino');
const logger = pino({ name: 'classifier' });

// ────────────────────────────────────────────
// TIERS: 5-level complexity scale
// ────────────────────────────────────────────
const TIERS = ['trivial', 'simple', 'moderate', 'complex', 'expert'];

// ────────────────────────────────────────────
// Intent detection patterns (regex + keyword ensemble)
// ────────────────────────────────────────────
const INTENT_PATTERNS = {
    code: {
        keywords: ['code', 'function', 'implement', 'debug', 'refactor', 'algorithm', 'class', 'api',
            'javascript', 'python', 'typescript', 'java', 'rust', 'sql', 'html', 'css',
            'compile', 'runtime', 'syntax', 'variable', 'loop', 'array', 'object',
            'import', 'export', 'async', 'await', 'promise', 'callback', 'regex',
            'git', 'docker', 'deploy', 'test', 'unit test', 'integration'],
        patterns: [/```[\s\S]*```/, /def\s+\w+/, /function\s+\w+/, /class\s+\w+/, /const\s+\w+\s*=/, /=>\s*{/]
    },
    math: {
        keywords: ['calculate', 'equation', 'integral', 'derivative', 'matrix', 'probability',
            'statistics', 'theorem', 'proof', 'algebra', 'geometry', 'calculus',
            'logarithm', 'exponential', 'factorial', 'permutation', 'combination',
            'solve', 'compute', 'formula'],
        patterns: [/\d+\s*[\+\-\*\/\^]\s*\d+/, /\$.*\$/, /\\frac/, /\\sum/, /\\int/]
    },
    analysis: {
        keywords: ['analyze', 'compare', 'evaluate', 'assess', 'review', 'critique',
            'pros and cons', 'trade-off', 'tradeoff', 'advantage', 'disadvantage',
            'impact', 'implication', 'consequence', 'root cause', 'deep dive',
            'perspective', 'framework', 'methodology'],
        patterns: [/compare\s+.+\s+(and|vs|versus)\s+/i, /what are the (pros|advantages|benefits)/i]
    },
    creative: {
        keywords: ['write', 'story', 'poem', 'essay', 'creative', 'fiction', 'narrative',
            'character', 'dialogue', 'plot', 'screenplay', 'lyrics', 'compose',
            'brainstorm', 'imagine', 'design', 'invent', 'generate ideas'],
        patterns: [/write\s+(a|an|me)\s+(story|poem|essay|song|script)/i, /once upon a time/i]
    },
    translation: {
        keywords: ['translate', 'translation', 'convert', 'language', 'spanish', 'french',
            'german', 'chinese', 'japanese', 'korean', 'arabic', 'hindi',
            'portuguese', 'italian', 'russian', 'localize', 'localization'],
        patterns: [/translate\s+.+\s+(to|into|from)\s+/i, /in\s+(spanish|french|german|chinese|japanese)/i]
    },
    qa: {
        keywords: ['what is', 'who is', 'when did', 'where is', 'how does', 'why does',
            'explain', 'define', 'describe', 'tell me', 'list', 'name',
            'summarize', 'summary', 'overview', 'brief', 'short answer'],
        patterns: [/^(what|who|when|where|how|why|can you|could you|is|are|do|does)\s/i]
    }
};

// ────────────────────────────────────────────
// Feature Extraction: 15+ numerical features
// ────────────────────────────────────────────
function extractFeatures(prompt) {
    const words = prompt.split(/\s+/).filter(w => w.length > 0);
    const sentences = prompt.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const lowerPrompt = prompt.toLowerCase();

    // 1. Length features
    const charCount = prompt.length;
    const wordCount = words.length;
    const sentenceCount = sentences.length;
    const avgWordLength = wordCount > 0 ? words.reduce((s, w) => s + w.length, 0) / wordCount : 0;
    const avgSentenceLength = sentenceCount > 0 ? wordCount / sentenceCount : 0;

    // 2. Vocabulary richness (type-token ratio)
    const uniqueWords = new Set(words.map(w => w.toLowerCase()));
    const typeTokenRatio = wordCount > 0 ? uniqueWords.size / wordCount : 0;

    // 3. Code block detection
    const codeBlockCount = (prompt.match(/```/g) || []).length / 2;
    const hasInlineCode = /`[^`]+`/.test(prompt);
    const codeIndicator = codeBlockCount > 0 ? 1 : (hasInlineCode ? 0.5 : 0);

    // 4. Question depth (nested questions, multi-part)
    const questionMarks = (prompt.match(/\?/g) || []).length;
    const questionDepth = Math.min(questionMarks / 3, 1); // normalize

    // 5. Structural complexity
    const bulletPoints = (prompt.match(/^[\s]*[-*•]\s/gm) || []).length;
    const numberedPoints = (prompt.match(/^[\s]*\d+[.)]\s/gm) || []).length;
    const structuralComplexity = Math.min((bulletPoints + numberedPoints) / 5, 1);

    // 6. Technical jargon density
    const technicalTerms = ['algorithm', 'architecture', 'implementation', 'optimization',
        'performance', 'scalability', 'concurrency', 'asynchronous', 'middleware',
        'microservice', 'database', 'schema', 'encryption', 'authentication',
        'authorization', 'infrastructure', 'deployment', 'configuration',
        'abstraction', 'inheritance', 'polymorphism', 'encapsulation',
        'normalization', 'denormalization', 'serialization', 'deserialization'];
    let techTermCount = 0;
    for (const term of technicalTerms) {
        if (lowerPrompt.includes(term)) techTermCount++;
    }
    const techDensity = Math.min(techTermCount / 5, 1);

    // 7. Reasoning indicators
    const reasoningKeywords = ['step-by-step', 'explain why', 'reason through', 'think about',
        'consider', 'analyze', 'evaluate', 'compare and contrast',
        'what are the implications', 'how would you approach', 'design a system'];
    let reasoningCount = 0;
    for (const kw of reasoningKeywords) {
        if (lowerPrompt.includes(kw)) reasoningCount++;
    }
    const reasoningDensity = Math.min(reasoningCount / 3, 1);

    // 8. Instruction specificity
    const hasConstraints = /\b(must|should|exactly|precisely|no more than|at least|between)\b/i.test(prompt);
    const hasFormat = /\b(json|xml|csv|markdown|table|list|bullet|format as|output as)\b/i.test(prompt);
    const specificity = (hasConstraints ? 0.5 : 0) + (hasFormat ? 0.5 : 0);

    // 9. Multi-turn context indicator
    const hasPriorReference = /\b(above|previous|earlier|you said|you mentioned|as I said)\b/i.test(prompt);

    // 10. Numerical complexity
    const numbers = (prompt.match(/\d+/g) || []);
    const hasLargeNumbers = numbers.some(n => parseInt(n) > 1000);
    const numericalDensity = Math.min(numbers.length / 10, 1);

    return {
        charCount: Math.min(charCount / 5000, 1),          // normalized
        wordCount: Math.min(wordCount / 1000, 1),           // normalized
        sentenceCount: Math.min(sentenceCount / 50, 1),     // normalized
        avgWordLength: Math.min(avgWordLength / 12, 1),     // normalized
        avgSentenceLength: Math.min(avgSentenceLength / 40, 1),
        typeTokenRatio,
        codeIndicator,
        questionDepth,
        structuralComplexity,
        techDensity,
        reasoningDensity,
        specificity,
        hasPriorReference: hasPriorReference ? 1 : 0,
        numericalDensity,
        hasLargeNumbers: hasLargeNumbers ? 1 : 0
    };
}

// ────────────────────────────────────────────
// Intent Detection
// ────────────────────────────────────────────
function detectIntent(prompt) {
    const lowerPrompt = prompt.toLowerCase();
    const scores = {};

    for (const [intent, config] of Object.entries(INTENT_PATTERNS)) {
        let score = 0;

        // Keyword matching
        for (const kw of config.keywords) {
            if (lowerPrompt.includes(kw)) score += 1;
        }

        // Pattern matching
        for (const pattern of config.patterns) {
            if (pattern.test(prompt)) score += 2;
        }

        scores[intent] = score;
    }

    // Find best match
    const entries = Object.entries(scores);
    entries.sort((a, b) => b[1] - a[1]);

    const [bestIntent, bestScore] = entries[0];
    const totalScore = entries.reduce((s, [, v]) => s + v, 0);

    // Confidence: how dominant is the top intent
    const confidence = totalScore > 0 ? bestScore / totalScore : 0;

    return {
        intent: bestScore > 0 ? bestIntent : 'general',
        confidence: Math.round(confidence * 100) / 100,
        scores
    };
}

// ────────────────────────────────────────────
// Heuristic Classifier (fallback / default)
// Enhanced version with 15 features → 5-tier output
// ────────────────────────────────────────────
function heuristicClassify(features) {
    // Weighted combination of features
    const weights = {
        charCount: 0.10,
        wordCount: 0.08,
        sentenceCount: 0.05,
        avgWordLength: 0.05,
        avgSentenceLength: 0.05,
        typeTokenRatio: 0.03,
        codeIndicator: 0.15,
        questionDepth: 0.08,
        structuralComplexity: 0.06,
        techDensity: 0.12,
        reasoningDensity: 0.10,
        specificity: 0.05,
        hasPriorReference: 0.02,
        numericalDensity: 0.03,
        hasLargeNumbers: 0.03
    };

    let rawScore = 0;
    for (const [key, weight] of Object.entries(weights)) {
        rawScore += (features[key] || 0) * weight;
    }

    // Scale to 0-100
    const score = Math.min(Math.round(rawScore * 100), 100);

    // Map to tier
    let tierIndex;
    if (score <= 10) tierIndex = 0;       // trivial
    else if (score <= 25) tierIndex = 1;  // simple
    else if (score <= 50) tierIndex = 2;  // moderate
    else if (score <= 75) tierIndex = 3;  // complex
    else tierIndex = 4;                    // expert

    return {
        tier: TIERS[tierIndex],
        score,
        confidence: 0.65 // heuristic confidence is capped
    };
}

// ────────────────────────────────────────────
// ONNX Classifier (GPU-accelerated when available)
// Will be loaded at startup if model file exists
// ────────────────────────────────────────────
let onnxSession = null;
let onnxReady = false;

async function loadOnnxModel() {
    try {
        const ort = require('onnxruntime-node');
        const modelPath = require('path').resolve(__dirname, '../../ml/models/complexity_classifier.onnx');
        const fs = require('fs');

        if (!fs.existsSync(modelPath)) {
            logger.warn('ONNX model not found at %s — using heuristic fallback', modelPath);
            return false;
        }

        // Try GPU first, fall back to CPU
        const sessionOptions = { logSeverityLevel: 3 };

        try {
            // Try DirectML (AMD/Intel/NVIDIA on Windows)
            sessionOptions.executionProviders = [{ name: 'dml' }];
            onnxSession = await ort.InferenceSession.create(modelPath, sessionOptions);
            logger.info('ONNX Runtime: DirectML GPU acceleration enabled');
        } catch {
            try {
                // Try CUDA (NVIDIA)
                sessionOptions.executionProviders = [{ name: 'cuda' }];
                onnxSession = await ort.InferenceSession.create(modelPath, sessionOptions);
                logger.info('ONNX Runtime: CUDA GPU acceleration enabled');
            } catch {
                // Fall back to CPU
                sessionOptions.executionProviders = [{ name: 'cpu' }];
                onnxSession = await ort.InferenceSession.create(modelPath, sessionOptions);
                logger.info('ONNX Runtime: CPU execution (no GPU detected)');
            }
        }

        onnxReady = true;
        return true;
    } catch (err) {
        logger.warn({ err: err.message }, 'Failed to load ONNX model — using heuristic fallback');
        return false;
    }
}

async function onnxClassify(features) {
    if (!onnxReady || !onnxSession) return null;

    try {
        const ort = require('onnxruntime-node');
        const featureArray = new Float32Array([
            features.charCount, features.wordCount, features.sentenceCount,
            features.avgWordLength, features.avgSentenceLength, features.typeTokenRatio,
            features.codeIndicator, features.questionDepth, features.structuralComplexity,
            features.techDensity, features.reasoningDensity, features.specificity,
            features.hasPriorReference, features.numericalDensity, features.hasLargeNumbers
        ]);

        const tensor = new ort.Tensor('float32', featureArray, [1, 15]);
        const results = await onnxSession.run({ features: tensor });

        // Model outputs probabilities for each tier
        const probabilities = results.probabilities.data;
        let maxIdx = 0;
        let maxProb = probabilities[0];
        for (let i = 1; i < probabilities.length; i++) {
            if (probabilities[i] > maxProb) {
                maxProb = probabilities[i];
                maxIdx = i;
            }
        }

        return {
            tier: TIERS[maxIdx],
            score: Math.round(maxProb * 100),
            confidence: Math.round(maxProb * 100) / 100
        };
    } catch (err) {
        logger.warn({ err: err.message }, 'ONNX inference failed, falling back to heuristic');
        return null;
    }
}

// ────────────────────────────────────────────
// Main classify function
// ────────────────────────────────────────────
async function classify(prompt) {
    const features = extractFeatures(prompt);
    const intentResult = detectIntent(prompt);

    // Try ONNX first, fall back to heuristic
    let classification = await onnxClassify(features);
    let method = 'onnx';

    if (!classification) {
        classification = heuristicClassify(features);
        method = 'heuristic';
    }

    return {
        tier: classification.tier,
        score: classification.score,
        confidence: classification.confidence,
        intent: intentResult.intent,
        intentConfidence: intentResult.confidence,
        intentScores: intentResult.scores,
        features,
        method
    };
}

module.exports = {
    classify,
    extractFeatures,
    detectIntent,
    loadOnnxModel,
    isOnnxReady: () => onnxReady,
    TIERS
};
