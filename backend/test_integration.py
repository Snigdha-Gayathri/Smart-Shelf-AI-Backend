"""
Integration test for SmartShelf AI backend.

Tests:
1. Server startup and readiness (/ready endpoint)
2. Recommendation endpoint (/api/v1/recommend)
3. Book selection endpoint (/api/v1/select_book)
4. Analytics endpoint (/api/v1/analytics)

Run this test with:
    python test_integration.py
"""

import subprocess
import time
import sys
import json
import requests
from pathlib import Path


def test_server_ready(base_url: str, timeout: int = 60) -> bool:
    """Poll /ready endpoint until server is ready or timeout."""
    print(f"[TEST] Polling {base_url}/ready (timeout: {timeout}s)...")
    start = time.time()
    while time.time() - start < timeout:
        try:
            resp = requests.get(f"{base_url}/ready", timeout=5)
            if resp.status_code == 200:
                data = resp.json()
                if data.get("ready"):
                    print(f"✅ Server ready: {data}")
                    return True
                else:
                    print(f"   Server warming up... {data}")
                    time.sleep(2)
            else:
                print(f"   GET /ready returned {resp.status_code}")
                time.sleep(2)
        except requests.exceptions.RequestException as e:
            print(f"   Connection error: {e}")
            time.sleep(2)
    
    print(f"❌ Server did not become ready within {timeout}s")
    return False


def test_recommend_endpoint(base_url: str) -> bool:
    """Test /api/v1/recommend endpoint."""
    print("\n[TEST] Testing /api/v1/recommend endpoint...")
    try:
        payload = {"text": "I want an uplifting, nostalgic book with a happy ending"}
        resp = requests.post(
            f"{base_url}/api/v1/recommend",
            json=payload,
            timeout=30
        )
        
        if resp.status_code != 200:
            print(f"❌ POST /api/v1/recommend returned {resp.status_code}")
            print(f"   Response: {resp.text[:500]}")
            return False
        
        data = resp.json()
        
        # Validate response structure
        required_keys = ["recommendations", "user_emotions", "analysis_method"]
        for key in required_keys:
            if key not in data:
                print(f"❌ Response missing key: {key}")
                return False
        
        recommendations = data["recommendations"]
        if not isinstance(recommendations, list):
            print(f"❌ 'recommendations' is not a list")
            return False
        
        if len(recommendations) == 0:
            print(f"❌ No recommendations returned")
            return False
        
        # Validate first recommendation structure
        rec = recommendations[0]
        required_rec_keys = ["title", "author", "cover", "synopsis", "genre", "score", "reason"]
        for key in required_rec_keys:
            if key not in rec:
                print(f"❌ Recommendation missing key: {key}")
                return False
        
        # Ensure cover is local path (starts with /) not external URL
        cover = rec["cover"]
        if isinstance(cover, str) and cover.startswith("http"):
            print(f"❌ Cover is external URL (should be local): {cover}")
            return False
        
        # Ensure reason exists
        if not rec.get("reason"):
            print(f"⚠️  Warning: 'reason' is empty for {rec['title']}")
        
        print(f"✅ Received {len(recommendations)} recommendations")
        print(f"   Top recommendation: {rec['title']} by {rec['author']}")
        print(f"   Cover: {rec['cover']}")
        print(f"   Score: {rec['score']:.3f}")
        print(f"   Reason: {rec['reason']}")
        print(f"   Analysis method: {data['analysis_method']}")
        
        return True
        
    except requests.exceptions.RequestException as e:
        print(f"❌ Request failed: {e}")
        return False
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        return False


def test_select_book_endpoint(base_url: str) -> bool:
    """Test /api/v1/select_book endpoint."""
    print("\n[TEST] Testing /api/v1/select_book endpoint...")
    try:
        payload = {
            "book_name": "Test Book",
            "genre": "fiction",
            "theme": "joy"
        }
        resp = requests.post(
            f"{base_url}/api/v1/select_book",
            json=payload,
            timeout=10
        )
        
        if resp.status_code != 200:
            print(f"❌ POST /api/v1/select_book returned {resp.status_code}")
            return False
        
        data = resp.json()
        if data.get("status") != "ok":
            print(f"❌ Selection failed: {data}")
            return False
        
        print(f"✅ Book selection saved: {data.get('message')}")
        return True
        
    except Exception as e:
        print(f"❌ Request failed: {e}")
        return False


def test_analytics_endpoint(base_url: str) -> bool:
    """Test /api/v1/analytics endpoint."""
    print("\n[TEST] Testing /api/v1/analytics endpoint...")
    try:
        resp = requests.get(f"{base_url}/api/v1/analytics", timeout=10)
        
        if resp.status_code != 200:
            print(f"❌ GET /api/v1/analytics returned {resp.status_code}")
            return False
        
        data = resp.json()
        if "analytics" not in data:
            print(f"❌ Response missing 'analytics' key")
            return False
        
        print(f"✅ Analytics retrieved: {data.get('analytics', {}).get('total_books_read', 0)} books read")
        return True
        
    except Exception as e:
        print(f"❌ Request failed: {e}")
        return False


def main():
    """Run integration tests against local backend."""
    print("=" * 60)
    print("SmartShelf AI Backend Integration Test")
    print("=" * 60)
    
    # Configuration
    base_url = "http://127.0.0.1:8000"
    backend_dir = Path(__file__).parent
    
    print(f"\nBackend directory: {backend_dir}")
    print(f"Base URL: {base_url}")
    
    # Check if server is already running
    try:
        resp = requests.get(f"{base_url}/health", timeout=2)
        if resp.status_code == 200:
            print("\n✅ Server already running")
            server_already_running = True
        else:
            server_already_running = False
    except:
        server_already_running = False
    
    if not server_already_running:
        print("\n⚠️  Server not running. Please start the backend with:")
        print(f"   cd {backend_dir}")
        print(f"   .venv\\Scripts\\activate")
        print(f"   uvicorn app:app --host 127.0.0.1 --port 8000")
        print("\nThen run this test again.")
        return 1
    
    # Run tests
    tests_passed = 0
    tests_total = 4
    
    # Test 1: Server ready
    if test_server_ready(base_url):
        tests_passed += 1
    
    # Test 2: Recommend endpoint
    if test_recommend_endpoint(base_url):
        tests_passed += 1
    
    # Test 3: Select book endpoint
    if test_select_book_endpoint(base_url):
        tests_passed += 1
    
    # Test 4: Analytics endpoint
    if test_analytics_endpoint(base_url):
        tests_passed += 1
    
    # Summary
    print("\n" + "=" * 60)
    print(f"Test Results: {tests_passed}/{tests_total} passed")
    print("=" * 60)
    
    if tests_passed == tests_total:
        print("✅ All tests passed!")
        return 0
    else:
        print(f"❌ {tests_total - tests_passed} test(s) failed")
        return 1


if __name__ == "__main__":
    sys.exit(main())
