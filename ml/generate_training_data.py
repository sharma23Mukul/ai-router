"""
Generate synthetic training data for the complexity classifier.

Creates labeled prompts across 5 complexity tiers with 15 numerical features each.
Output: training_data.csv with features + labels.
"""

import csv
import random
import os

TIERS = ['trivial', 'simple', 'moderate', 'complex', 'expert']

# Template prompts per tier
TEMPLATES = {
    'trivial': [
        "Hi", "Hello", "Thanks", "Yes", "No", "OK", "Sure",
        "What time is it?", "Hello there", "Goodbye",
        "How are you?", "What's up?", "Hey", "Good morning",
        "Tell me a joke", "What's 2+2?", "Say hello",
        "What is the weather?", "Hi there!", "Bye"
    ],
    'simple': [
        "What is Python?",
        "How do I install Node.js?",
        "What's the capital of France?",
        "Translate 'hello' to Spanish",
        "What is machine learning?",
        "How do I create a list in Python?",
        "What is the difference between HTTP and HTTPS?",
        "Summarize this in one sentence: {}",
        "What are the primary colors?",
        "How many continents are there?",
        "Define 'recursion'",
        "What is an API?",
        "How do I print 'Hello World' in JavaScript?",
        "What is a variable?",
        "List 5 programming languages",
        "What is the speed of light?",
        "Who invented the telephone?",
        "What does HTML stand for?",
        "How do I start a Python script?",
        "What is an integer?"
    ],
    'moderate': [
        "Explain the difference between SQL and NoSQL databases with examples",
        "Write a function in Python that sorts a list using bubble sort",
        "Compare React and Vue.js for frontend development",
        "How does garbage collection work in Java?",
        "Explain REST API design principles with examples",
        "Write a regular expression to validate email addresses",
        "What are the SOLID principles in software engineering?",
        "Explain how DNS resolution works step by step",
        "Write a Python class for a binary search tree",
        "Compare TCP and UDP protocols with use cases",
        "Explain the MVC architecture pattern",
        "Write unit tests for a calculator class in JavaScript",
        "How does OAuth 2.0 authentication work?",
        "Explain the CAP theorem with real-world examples",
        "Design a simple REST API for a todo application",
        "What is the difference between threads and processes?",
        "Explain how indexing works in databases",
        "Write a recursive function to compute Fibonacci numbers",
        "Compare monolithic and microservices architectures",
        "How does TLS/SSL encryption work?"
    ],
    'complex': [
        "Design a distributed caching system like Redis. Include data structures, replication strategy, and consistency model. Provide pseudocode for the core operations.",
        "Implement a rate limiter using the token bucket algorithm in Go. Include thread safety, Redis backing, and sliding window support. Write production-grade tests.",
        "Analyze the time and space complexity of the following algorithm and suggest optimizations for handling 10 million records: [complex nested loop code]",
        "Design a real-time notification system that handles 100K concurrent WebSocket connections. Include message queuing, fan-out strategy, and failure recovery.",
        "Implement a B+ tree in Rust with insert, delete, and range query operations. Explain the rebalancing algorithm step by step.",
        "Design the database schema and query optimization strategy for a social media platform handling 1 billion posts. Include sharding strategy.",
        "Compare the consensus mechanisms Raft, Paxos, and Byzantine fault tolerance. When would you use each? Provide implementation pseudocode for Raft.",
        "Implement a compiler frontend for a simple expression language. Include lexer, parser (recursive descent), and AST generation in Python.",
        "Design a CI/CD pipeline for a microservices architecture with 50 services. Include canary deployments, rollback strategy, and monitoring integration.",
        "Analyze the security implications of JWT vs session-based authentication at scale. Include token rotation, revocation strategies, and XSS/CSRF mitigation."
    ],
    'expert': [
        "Design a globally distributed database system that supports strong consistency across 5 continents with sub-100ms read latency. Detail the replication protocol, conflict resolution, partitioning strategy, failure detection, and automatic failover. Provide the mathematical proof for the consistency guarantees. Compare against DynamoDB, Spanner, and CockroachDB architectures.",
        "Implement a garbage collector for a managed language runtime. Support generational collection, concurrent marking, compaction, and write barriers. Analyze the pause time characteristics and compare against G1GC, ZGC, and Shenandoah. Provide the implementation in C with detailed comments.",
        "Design a machine learning pipeline for real-time fraud detection processing 500K transactions per second. Include feature engineering, model architecture (why not just random forest?), online learning with concept drift detection, explainability requirements (SHAP/LIME), and regulatory compliance (GDPR, PCI-DSS). Provide the system architecture diagram.",
        "Formally verify the correctness of a lock-free concurrent queue implementation using TLA+ or Coq. Prove linearizability and show that it's wait-free for dequeue operations. Compare memory ordering requirements across x86, ARM, and RISC-V architectures.",
        "Design a new programming language for quantum-classical hybrid computing. Define the type system (must handle qubits and entanglement), memory model, error correction integration, and compilation target (OpenQASM + classical code). Provide BNF grammar and operational semantics."
    ]
}

def extract_features(prompt):
    """Extract 15 numerical features from a prompt, same as classifier.js"""
    words = prompt.split()
    sentences = [s.strip() for s in prompt.replace('!', '.').replace('?', '.').split('.') if s.strip()]
    lower = prompt.lower()
    
    char_count = min(len(prompt) / 5000, 1)
    word_count = min(len(words) / 1000, 1)
    sentence_count = min(len(sentences) / 50, 1)
    avg_word_len = min((sum(len(w) for w in words) / max(len(words), 1)) / 12, 1)
    avg_sent_len = min(len(words) / max(len(sentences), 1) / 40, 1)
    
    unique_words = set(w.lower() for w in words)
    type_token_ratio = len(unique_words) / max(len(words), 1)
    
    code_blocks = prompt.count('```') // 2
    has_inline = 1 if '`' in prompt and prompt.count('`') >= 2 else 0
    code_indicator = 1 if code_blocks > 0 else (0.5 if has_inline else 0)
    
    question_marks = prompt.count('?')
    question_depth = min(question_marks / 3, 1)
    
    bullets = sum(1 for line in prompt.split('\n') if line.strip().startswith(('-', '*', '•')))
    numbered = sum(1 for line in prompt.split('\n') if line.strip() and line.strip()[0].isdigit())
    structural_complexity = min((bullets + numbered) / 5, 1)
    
    tech_terms = ['algorithm', 'architecture', 'implementation', 'optimization',
        'performance', 'scalability', 'concurrency', 'asynchronous', 'middleware',
        'microservice', 'database', 'schema', 'encryption', 'authentication',
        'authorization', 'infrastructure', 'deployment', 'configuration',
        'abstraction', 'inheritance', 'polymorphism', 'encapsulation',
        'normalization', 'denormalization', 'serialization', 'deserialization']
    tech_count = sum(1 for t in tech_terms if t in lower)
    tech_density = min(tech_count / 5, 1)
    
    reasoning_kw = ['step-by-step', 'explain why', 'reason through', 'think about',
        'consider', 'analyze', 'evaluate', 'compare and contrast',
        'what are the implications', 'how would you approach', 'design a system']
    reasoning_count = sum(1 for kw in reasoning_kw if kw in lower)
    reasoning_density = min(reasoning_count / 3, 1)
    
    has_constraints = 1 if any(w in lower for w in ['must', 'should', 'exactly', 'precisely', 'no more than', 'at least', 'between']) else 0
    has_format = 1 if any(w in lower for w in ['json', 'xml', 'csv', 'markdown', 'table', 'list', 'bullet', 'format as', 'output as']) else 0
    specificity = (has_constraints * 0.5) + (has_format * 0.5)
    
    has_prior_ref = 1 if any(w in lower for w in ['above', 'previous', 'earlier', 'you said', 'you mentioned', 'as i said']) else 0
    
    import re
    numbers = re.findall(r'\d+', prompt)
    has_large = 1 if any(int(n) > 1000 for n in numbers if n.isdigit()) else 0
    numerical_density = min(len(numbers) / 10, 1)
    
    return [
        char_count, word_count, sentence_count, avg_word_len, avg_sent_len,
        type_token_ratio, code_indicator, question_depth, structural_complexity,
        tech_density, reasoning_density, specificity, has_prior_ref,
        numerical_density, has_large
    ]

def generate_dataset(samples_per_tier=200):
    """Generate training data with feature extraction."""
    data = []
    
    for tier_idx, tier in enumerate(TIERS):
        templates = TEMPLATES[tier]
        for i in range(samples_per_tier):
            # Pick a template and optionally add noise
            prompt = random.choice(templates)
            
            # Add variation
            if random.random() > 0.5:
                prompt = prompt + " " + random.choice([
                    "Please be detailed.",
                    "Keep it brief.",
                    "Explain like I'm five.",
                    "Use technical terminology.",
                    "Give me an example.",
                    ""
                ])
            
            features = extract_features(prompt)
            data.append(features + [tier_idx])  # tier_idx is the label
    
    return data

def main():
    print("Generating synthetic training data...")
    data = generate_dataset(samples_per_tier=300)
    random.shuffle(data)
    
    feature_names = [
        'char_count', 'word_count', 'sentence_count', 'avg_word_len', 'avg_sent_len',
        'type_token_ratio', 'code_indicator', 'question_depth', 'structural_complexity',
        'tech_density', 'reasoning_density', 'specificity', 'has_prior_ref',
        'numerical_density', 'has_large'
    ]
    
    output_dir = os.path.dirname(os.path.abspath(__file__))
    output_path = os.path.join(output_dir, 'training_data.csv')
    
    with open(output_path, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(feature_names + ['label'])
        writer.writerows(data)
    
    print(f"Generated {len(data)} samples → {output_path}")
    print(f"Distribution: {', '.join(f'{t}: {300}' for t in TIERS)}")

if __name__ == '__main__':
    main()
