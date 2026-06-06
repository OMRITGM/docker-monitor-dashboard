from fastapi.testclient import TestClient
from app import app

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
    assert len(data) > 0

def test_get_config():
    response = client.get("/api/config")
    assert response.status_code == 200
    data = response.json()
    assert "webhook_url" in data
    assert "docker_host" in data
