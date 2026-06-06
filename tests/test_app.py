from fastapi.testclient import TestClient
import sys
import os

# Ensure the app module can be imported
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app, MOCK_CONTAINERS, MOCK_MODE

client = TestClient(app)

def test_read_root():
    response = client.get("/")
    assert response.status_code == 200

def test_get_containers():
    response = client.get("/api/containers")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    # We expect mock containers in simulation mode
    assert len(data) > 0, f"Expected mock containers to be returned, but got empty list. MOCK_MODE={MOCK_MODE}, available_mocks={list(MOCK_CONTAINERS.keys())}"

def test_get_config():
    response = client.get("/api/config")
    assert response.status_code == 200
    data = response.json()
    assert "webhook_url" in data
    assert "docker_host" in data
