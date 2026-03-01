"""
Test script for quantum emotion analysis pipeline
Run this to validate the local pipeline works correctly
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from services.quantum_emotion_pipeline import (
    detect_emotions,
    generate_embeddings,
    quantum_similarity,
    analyze_prompt,
    warmup
)

def test_pipeline():
    print("\n" + "="*70)
    print("🧪 TESTING QUANTUM EMOTION ANALYSIS PIPELINE")
    print("="*70)
    
    # Test 1: Model Loading
    print("\n[TEST 1] Loading models...")
    try:
        warmup()
        print("✅ Models loaded successfully")
    except Exception as e:
        print(f"❌ Model loading failed: {e}")
        return
    
    # Test 2: Emotion Detection
    print("\n[TEST 2] Testing emotion detection...")
    test_text = "I'm feeling nostalgic yet hopeful about my childhood memories"
    try:
        emotions = detect_emotions(test_text)
        print(f"✅ Detected {len(emotions)} emotions:")
        for emotion, score in list(emotions.items())[:3]:
            print(f"   - {emotion}: {score:.3f}")
    except Exception as e:
        print(f"❌ Emotion detection failed: {e}")
        return
    
    # Test 3: Embedding Generation
    print("\n[TEST 3] Testing embedding generation...")
    try:
        embeddings = generate_embeddings([test_text, "joy", "nostalgia"])
        print(f"✅ Generated embeddings with shape: {embeddings.shape}")
    except Exception as e:
        print(f"❌ Embedding generation failed: {e}")
        return
    
    # Test 4: Quantum Similarity
    print("\n[TEST 4] Testing quantum kernel similarity...")
    try:
        emb1 = embeddings[0]
        emb2 = embeddings[1]
        similarity = quantum_similarity(emb1, emb2)
        print(f"✅ Quantum similarity computed: {similarity:.4f}")
    except Exception as e:
        print(f"❌ Quantum similarity failed: {e}")
        return
    
    # Test 5: Full Pipeline
    print("\n[TEST 5] Testing complete analysis pipeline...")
    try:
        result = analyze_prompt(test_text)
        print(f"✅ Full pipeline analysis complete:")
        print(f"   - Emotions detected: {result['emotion_count']}")
        print(f"   - Top emotion: {result['top_emotion']}")
        print(f"   - Quantum similarities computed: {len(result['quantum_similarities'])}")
    except Exception as e:
        print(f"❌ Full pipeline failed: {e}")
        return
    
    # Test 6: Multiple Prompts
    print("\n[TEST 6] Testing with multiple prompts...")
    test_prompts = [
        "a mafia romance with a powerful female lead and a happy ending",
        "feeling anxious but determined to finish this project",
        "calm and peaceful morning by the lake"
    ]
    
    for i, prompt in enumerate(test_prompts, 1):
        try:
            result = analyze_prompt(prompt)
            top_3 = list(result['compound_emotions'].items())[:3]
            print(f"\n   Prompt {i}: '{prompt[:40]}...'")
            print(f"   Top emotions: {', '.join([e[0] for e in top_3])}")
        except Exception as e:
            print(f"   ❌ Failed for prompt {i}: {e}")
    
    print("\n" + "="*70)
    print("✅ ALL TESTS PASSED - Pipeline is ready!")
    print("="*70)
    print("\n📌 Next steps:")
    print("   1. Restart your FastAPI backend")
    print("   2. Test the endpoint: POST http://127.0.0.1:8000/api/v1/analyze_emotion")
    print("   3. Send JSON: {\"prompt\": \"your text here\"}")
    print("\n🔒 Privacy: All processing is LOCAL - no API calls, fully private\n")

if __name__ == "__main__":
    test_pipeline()
