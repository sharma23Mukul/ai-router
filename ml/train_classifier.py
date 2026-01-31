"""
Train complexity classifier and export to ONNX format.

Pipeline:
1. Load training data (from generate_training_data.py)
2. Train Random Forest classifier
3. Evaluate accuracy
4. Export to ONNX for Node.js inference
"""

import os
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, accuracy_score
import joblib

TIERS = ['trivial', 'simple', 'moderate', 'complex', 'expert']
FEATURE_NAMES = [
    'char_count', 'word_count', 'sentence_count', 'avg_word_len', 'avg_sent_len',
    'type_token_ratio', 'code_indicator', 'question_depth', 'structural_complexity',
    'tech_density', 'reasoning_density', 'specificity', 'has_prior_ref',
    'numerical_density', 'has_large'
]

def main():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    data_path = os.path.join(base_dir, 'training_data.csv')
    
    if not os.path.exists(data_path):
        print("Training data not found. Run generate_training_data.py first.")
        print(f"Expected: {data_path}")
        return
    
    # Load data
    print("Loading training data...")
    df = pd.read_csv(data_path)
    X = df[FEATURE_NAMES].values.astype(np.float32)
    y = df['label'].values
    
    print(f"Dataset: {len(X)} samples, {len(FEATURE_NAMES)} features, {len(TIERS)} classes")
    
    # Split
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
    
    # Train Random Forest
    print("\nTraining Random Forest classifier...")
    clf = RandomForestClassifier(
        n_estimators=100,
        max_depth=10,
        min_samples_split=5,
        min_samples_leaf=2,
        random_state=42,
        n_jobs=-1
    )
    clf.fit(X_train, y_train)
    
    # Evaluate
    y_pred = clf.predict(X_test)
    accuracy = accuracy_score(y_test, y_pred)
    print(f"\nAccuracy: {accuracy:.4f}")
    print("\nClassification Report:")
    print(classification_report(y_test, y_pred, target_names=TIERS))
    
    # Feature importance
    importances = clf.feature_importances_
    sorted_idx = np.argsort(importances)[::-1]
    print("\nFeature Importance:")
    for idx in sorted_idx:
        print(f"  {FEATURE_NAMES[idx]:25s}: {importances[idx]:.4f}")
    
    # Export to ONNX
    print("\nExporting to ONNX...")
    try:
        from skl2onnx import to_onnx
        
        model_dir = os.path.join(base_dir, 'models')
        os.makedirs(model_dir, exist_ok=True)
        
        # Convert to ONNX
        onnx_model = to_onnx(clf, X_train[:1], target_opset=12,
                             options={id(clf): {'zipmap': False}})
        
        # Rename inputs/outputs for compatibility with classifier.js
        for inp in onnx_model.graph.input:
            inp.name = 'features'
        for node in onnx_model.graph.node:
            for i, name in enumerate(node.input):
                if name == 'X':
                    node.input[i] = 'features'
        for out in onnx_model.graph.output:
            if 'probabilities' in out.name.lower() or out.name == 'output_probability':
                out.name = 'probabilities'
            elif out.name == 'output_label' or 'label' in out.name.lower():
                out.name = 'label'
        # Update node outputs to match
        for node in onnx_model.graph.node:
            for i, name in enumerate(node.output):
                if 'probabilities' in name.lower() or name == 'output_probability':
                    node.output[i] = 'probabilities'
                elif name == 'output_label' or 'label' in name.lower():
                    node.output[i] = 'label'
        
        onnx_path = os.path.join(model_dir, 'complexity_classifier.onnx')
        with open(onnx_path, 'wb') as f:
            f.write(onnx_model.SerializeToString())
        
        print(f"ONNX model saved to: {onnx_path}")
        print(f"Model size: {os.path.getsize(onnx_path) / 1024:.1f} KB")
        
        # Verify ONNX model
        import onnxruntime as ort
        session = ort.InferenceSession(onnx_path)
        test_input = X_test[:5]
        results = session.run(None, {'features': test_input})
        print(f"\nONNX verification (5 samples):")
        for i in range(5):
            pred_label = results[0][i] if len(results) > 0 else 'N/A'
            pred_probs = results[1][i] if len(results) > 1 else 'N/A'
            print(f"  Sample {i}: predicted={TIERS[int(pred_label)]}, actual={TIERS[y_test[i]]}")
        
    except ImportError as e:
        print(f"ONNX export failed (install skl2onnx): {e}")
        print("The heuristic fallback classifier will be used instead.")
        
        # Save sklearn model as fallback
        model_path = os.path.join(base_dir, 'models', 'complexity_classifier.pkl')
        os.makedirs(os.path.dirname(model_path), exist_ok=True)
        joblib.dump(clf, model_path)
        print(f"Sklearn model saved to: {model_path}")

if __name__ == '__main__':
    main()
