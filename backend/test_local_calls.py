from fastapi.testclient import TestClient
import json
from app import app

client = TestClient(app)
print('Calling /ready')
r = client.get('/ready')
print('status', r.status_code)
print(r.json())
print('\nCalling /api/v1/recommend')
r2 = client.post('/api/v1/recommend', json={'text':'I want a hopeful romantic book with nostalgia'})
print('status', r2.status_code)
print(json.dumps(r2.json(), indent=2)[:2000])
