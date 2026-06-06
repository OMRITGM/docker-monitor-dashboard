import os
import json
import asyncio
import time
import random
import threading
import requests
from typing import Dict, List, Set
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import docker

# Initialize FastAPI App
app = FastAPI(title="Docker Monitor Dashboard")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration File
CONFIG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")

def load_config() -> dict:
    default_config = {"webhook_url": "", "docker_host": ""}
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r") as f:
                loaded = json.load(f)
                # Ensure all default keys exist
                for k, v in default_config.items():
                    if k not in loaded:
                        loaded[k] = v
                return loaded
        except Exception:
            pass
    return default_config

def save_config(config: dict):
    try:
        with open(CONFIG_FILE, "w") as f:
            json.dump(config, f, indent=4)
    except Exception as e:
        print(f"Error saving config: {e}")

# Global Config State
app_config = load_config()

import urllib.parse

def parse_docker_host(host_input: str) -> str:
    if not host_input:
        return ""
    host_input = host_input.strip()
    if not host_input:
        return ""
        
    # Check if it is already a socket scheme (e.g. tcp:// or unix:// or npipe://)
    if "://" in host_input:
        try:
            parsed = urllib.parse.urlparse(host_input)
            hostname = parsed.hostname
            port = parsed.port
            if hostname and port in [5000, 5001, 5005]:
                # Synology DSM ports. Map to Docker default port 2375
                return f"tcp://{hostname}:2375"
        except Exception:
            pass
        return host_input
        
    # Handles simple IP, host, or IP:Port
    # e.g., "192.168.50.193" or "http://192.168.50.193:5000" or "192.168.50.193:5000"
    if ":" in host_input:
        if host_input.startswith("http"):
            try:
                temp_url = host_input if "://" in host_input else f"http://{host_input}"
                parsed = urllib.parse.urlparse(temp_url)
                hostname = parsed.hostname
                port = parsed.port
                if hostname:
                    if port in [5000, 5001, 5005]:
                        return f"tcp://{hostname}:2375"
                    port_str = f":{port}" if port else ":2375"
                    return f"tcp://{hostname}{port_str}"
            except Exception:
                pass
        else:
            parts = host_input.split(":")
            if len(parts) == 2:
                host, port = parts[0], parts[1]
                try:
                    port_val = int(port)
                    if port_val in [5000, 5001]:
                        return f"tcp://{host}:2375"
                    return f"tcp://{host}:{port_val}"
                except ValueError:
                    pass
            return f"tcp://{host_input}"
    else:
        # Just host/IP, e.g. "192.168.50.193"
        return f"tcp://{host_input}:2375"
        
    return host_input

# Docker Client Initialization & Remote Host support
stats_lock = threading.Lock()
docker_client = None
MOCK_MODE = False

def init_docker(host_url=None):
    global docker_client, MOCK_MODE
    with stats_lock:
        try:
            parsed_host = parse_docker_host(host_url)
            if parsed_host:
                print(f"Attempting connection to remote Docker host: {parsed_host} (parsed from: {host_url})")
                docker_client = docker.DockerClient(base_url=parsed_host, timeout=5)
            else:
                print("Attempting connection to local Docker engine...")
                # On Windows, docker.from_env() connects via Named Pipe (//./pipe/docker_engine)
                docker_client = docker.from_env(timeout=5)
            
            # Ping to verify the daemon is responsive
            docker_client.ping()
            MOCK_MODE = False
            print("Successfully established link to Docker Engine.")
            return True
        except Exception as e:
            print(f"Docker connection failed: {e}")
            docker_client = None
            MOCK_MODE = True
            print("Switched to J.A.R.V.I.S. Mock/Simulation Mode.")
            return False

# Initial connection attempt
init_docker(app_config.get("docker_host"))

# Mock Containers Database
MOCK_CONTAINERS = {
    "web-nginx": {
        "id": "c1b2c3d4e5f6_nginx",
        "name": "web-nginx",
        "image": "nginx:alpine",
        "status": "running",
        "created": "2026-06-05T12:00:00Z",
        "logs": [
            "2026-06-05T12:00:01Z [notice] 1#1: using the 'epoll' event method",
            "2026-06-05T12:00:01Z [notice] 1#1: nginx/1.25.3",
            "2026-06-05T12:00:01Z [notice] 1#1: start worker process 31",
            "2026-06-05T12:00:05Z 192.168.1.5 - - [05/Jun/2026:12:00:05 +0000] \"GET / HTTP/1.1\" 200 615 \"-\" \"Mozilla/5.0\""
        ],
        "cpu_usage": 1.2,
        "mem_usage_mb": 14.5,
        "mem_limit_mb": 512.0,
        "net_input_kb": 124.5,
        "net_output_kb": 1056.2,
        "exit_code": 0
    },
    "db-postgres": {
        "id": "f5e4d3c2b1a0_postgres",
        "name": "db-postgres",
        "image": "postgres:15-alpine",
        "status": "running",
        "created": "2026-06-05T11:50:00Z",
        "logs": [
            "2026-06-05T11:50:02Z PostgreSQL Database directory appears to contain a database; Skipping initialization",
            "2026-06-05T11:50:02Z server started",
            "2026-06-05T11:50:03Z database system is ready to accept connections"
        ],
        "cpu_usage": 0.8,
        "mem_usage_mb": 42.1,
        "mem_limit_mb": 1024.0,
        "net_input_kb": 3410.8,
        "net_output_kb": 8920.4,
        "exit_code": 0
    },
    "api-node": {
        "id": "a1b2c3d4e5f6_node",
        "name": "api-node",
        "image": "node:18-alpine",
        "status": "running",
        "created": "2026-06-05T12:05:00Z",
        "logs": [
            "2026-06-05T12:05:02Z yarn run v1.22.19",
            "2026-06-05T12:05:03Z $ node server.js",
            "2026-06-05T12:05:03Z Server listening on port 3000",
            "2026-06-05T12:05:10Z GET /api/v1/health 200 12ms",
            "2026-06-05T12:05:12Z GET /api/v1/users 200 45ms"
        ],
        "cpu_usage": 4.5,
        "mem_usage_mb": 88.2,
        "mem_limit_mb": 1024.0,
        "net_input_kb": 512.4,
        "net_output_kb": 204.8,
        "exit_code": 0
    },
    "worker-python": {
        "id": "e1d2c3b4a5f6_python",
        "name": "worker-python",
        "image": "python:3.10-slim",
        "status": "running",
        "created": "2026-06-05T12:02:00Z",
        "logs": [
            "2026-06-05T12:02:01Z Processing queue: tasks_main",
            "2026-06-05T12:02:05Z Task #4823 completed successfully in 1.4s",
            "2026-06-05T12:03:00Z Task #4824 fetched from queue..."
        ],
        "cpu_usage": 15.6,
        "mem_usage_mb": 128.0,
        "mem_limit_mb": 2048.0,
        "net_input_kb": 89.1,
        "net_output_kb": 43.5,
        "exit_code": 0
    },
    "redis-cache": {
        "id": "9876543210ab_redis",
        "name": "redis-cache",
        "image": "redis:7-alpine",
        "status": "exited",
        "created": "2026-06-05T10:00:00Z",
        "logs": [
            "2026-06-05T10:00:01Z 1:C 05 Jun 2026 10:00:01.214 # oO0OoO0OoO0Oo Redis is starting oO0OoO0OoO0Oo",
            "2026-06-05T10:00:01Z 1:M 05 Jun 2026 10:00:01.215 * Running mode=standalone, port=6379.",
            "2026-06-05T10:01:00Z 1:M 05 Jun 2026 10:01:00.005 # User requested shutdown. Exiting."
        ],
        "cpu_usage": 0.0,
        "mem_usage_mb": 0.0,
        "mem_limit_mb": 256.0,
        "net_input_kb": 0.0,
        "net_output_kb": 0.0,
        "exit_code": 0
    }
}

# In-memory metrics cache to feed WebSocket & detect transitions
cached_states = {}
active_connections: Set[WebSocket] = set()

# Models
class ConfigUpdate(BaseModel):
    webhook_url: str
    docker_host: str

class ActionRequest(BaseModel):
    action: str

# Helper to send webhook alerts
def send_webhook_alert(container_name: str, image: str, event: str, details: str):
    webhook_url = app_config.get("webhook_url", "")
    if not webhook_url:
        return
    
    payload = {
        "event": event,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "container": {
            "name": container_name,
            "image": image,
            "status": "stopped" if "stop" in event or "exited" in event or "die" in event else "running"
        },
        "details": details
    }
    
    def post_request():
        try:
            response = requests.post(webhook_url, json=payload, timeout=5)
            print(f"Webhook alert sent for {container_name}. Status code: {response.status_code}")
        except Exception as e:
            print(f"Failed to send Webhook: {e}")

    # Run in thread to prevent blocking
    threading.Thread(target=post_request, daemon=True).start()

# Calculate Docker Container stats (Standard Docker CPU formula)
def get_docker_cpu_percent(stats_data):
    try:
        cpu_stats = stats_data.get("cpu_stats", {})
        precpu_stats = stats_data.get("precpu_stats", {})
        
        cpu_usage = cpu_stats.get("cpu_usage", {}).get("total_usage", 0)
        precpu_usage = precpu_stats.get("cpu_usage", {}).get("total_usage", 0)
        
        system_cpu = cpu_stats.get("system_cpu_usage", 0)
        system_precpu = precpu_stats.get("system_cpu_usage", 0)
        
        cpu_delta = cpu_usage - precpu_usage
        system_delta = system_cpu - system_precpu
        
        num_cpus = len(cpu_stats.get("cpu_usage", {}).get("percpu_usage", [1]))
        if system_delta > 0 and cpu_delta > 0:
            return round((cpu_delta / system_delta) * num_cpus * 100.0, 2)
    except Exception:
        pass
    return 0.0

def get_docker_memory_usage(stats_data):
    try:
        mem_stats = stats_data.get("memory_stats", {})
        usage = mem_stats.get("usage", 0)
        limit = mem_stats.get("limit", 1)
        usage_mb = round(usage / (1024 * 1024), 2)
        limit_mb = round(limit / (1024 * 1024), 2)
        percent = round((usage / limit) * 100.0, 2)
        return usage_mb, limit_mb, percent
    except Exception:
        pass
    return 0.0, 0.0, 0.0

def get_docker_network_io(stats_data):
    try:
        networks = stats_data.get("networks", {})
        rx = sum(net.get("rx_bytes", 0) for net in networks.values())
        tx = sum(net.get("tx_bytes", 0) for net in networks.values())
        return round(rx / 1024, 2), round(tx / 1024, 2)
    except Exception:
        pass
    return 0.0, 0.0

# Background task to gather metrics and broadcast them
async def metrics_poller():
    global MOCK_MODE, MOCK_CONTAINERS, cached_states
    
    while True:
        try:
            current_data = []
            
            with stats_lock:
                if MOCK_MODE:
                    # Update mock containers
                    for name, details in MOCK_CONTAINERS.items():
                        if details["status"] == "running":
                            # Fluctuate CPU
                            base_cpu = 1.0 if "nginx" in name else (3.0 if "node" in name else (0.5 if "postgres" in name else 12.0))
                            details["cpu_usage"] = max(0.1, round(base_cpu + random.uniform(-1.5, 1.5), 2))
                            
                            # Fluctuate Memory
                            mem_offset = random.uniform(-0.5, 0.5)
                            details["mem_usage_mb"] = max(5.0, round(details["mem_usage_mb"] + mem_offset, 2))
                            
                            # Network updates
                            details["net_input_kb"] += round(random.uniform(1.0, 15.0), 2)
                            details["net_output_kb"] += round(random.uniform(5.0, 50.0), 2)
                            
                            # Random simulated log entries (10% chance)
                            if random.random() < 0.15:
                                log_types = ["INFO", "DEBUG", "WARN"]
                                log_msg = f"Simulated {random.choice(log_types)} message from {name}"
                                if "nginx" in name:
                                    log_msg = f"192.168.1.{random.randint(2,254)} - - [{time.strftime('%d/%b/%Y:%H:%M:%S')} +0000] \"GET /api/v1/data HTTP/1.1\" 200 {random.randint(100,5000)}"
                                elif "postgres" in name:
                                    log_msg = f"statement: SELECT * FROM users LIMIT {random.randint(10,100)};"
                                elif "node" in name:
                                    log_msg = f"GET /api/users/{random.randint(1,1000)} - {random.randint(5,150)}ms"
                                else:
                                    log_msg = f"Queue worker successfully processed job #{random.randint(1000,9999)}"
                                
                                timestamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                                details["logs"].append(f"{timestamp} {log_msg}")
                                # Keep logs length reasonable
                                if len(details["logs"]) > 100:
                                    details["logs"].pop(0)
                        else:
                            details["cpu_usage"] = 0.0
                            
                        # Add to list
                        current_data.append({
                            "id": details["id"],
                            "name": details["name"],
                            "image": details["image"],
                            "status": details["status"],
                            "created": details["created"],
                            "cpu_percent": details["cpu_usage"],
                            "mem_usage_mb": details["mem_usage_mb"],
                            "mem_limit_mb": details["mem_limit_mb"],
                            "mem_percent": round((details["mem_usage_mb"] / details["mem_limit_mb"]) * 100.0, 2) if details["mem_limit_mb"] > 0 else 0,
                            "net_input_kb": details["net_input_kb"],
                            "net_output_kb": details["net_output_kb"]
                        })
                else:
                    # Query real Docker daemon
                    try:
                        containers = docker_client.containers.list(all=True)
                        for container in containers:
                            status = container.status
                            # Try to fetch stats if running
                            cpu = 0.0
                            mem_usage = 0.0
                            mem_limit = 0.0
                            mem_percent = 0.0
                            net_in = 0.0
                            net_out = 0.0
                            
                            if status == "running":
                                try:
                                    # Fetch non-streaming stats (returns single snapshot)
                                    stats = container.stats(stream=False)
                                    cpu = get_docker_cpu_percent(stats)
                                    mem_usage, mem_limit, mem_percent = get_docker_memory_usage(stats)
                                    net_in, net_out = get_docker_network_io(stats)
                                except Exception:
                                    pass
                                    
                            current_data.append({
                                "id": container.short_id,
                                "name": container.name,
                                "image": container.image.tags[0] if container.image.tags else container.image.short_id,
                                "status": status,
                                "created": container.attrs.get("Created", ""),
                                "cpu_percent": cpu,
                                "mem_usage_mb": mem_usage,
                                "mem_limit_mb": mem_limit,
                                "mem_percent": mem_percent,
                                "net_input_kb": net_in,
                                "net_output_kb": net_out
                            })
                    except Exception as e:
                        print(f"Error querying Docker: {e}. Switching to Mock Mode.")
                        MOCK_MODE = True
                        continue

            # Detect status changes and send webhook alerts
            for c in current_data:
                name = c["name"]
                status = c["status"]
                image = c["image"]
                
                if name in cached_states:
                    old_status = cached_states[name]
                    if old_status == "running" and status != "running":
                        # Failure or unexpected stop event
                        event_name = f"Container Stop ({status})"
                        details = f"The container '{name}' transitioned from 'running' to '{status}'."
                        send_webhook_alert(name, image, event_name, details)
                    elif old_status != "running" and status == "running":
                        # Recover/Start event
                        event_name = "Container Start"
                        details = f"The container '{name}' has been started."
                        send_webhook_alert(name, image, event_name, details)
                
                cached_states[name] = status

            # Broadcast to WebSockets
            if active_connections:
                payload = {
                    "is_mock": MOCK_MODE,
                    "timestamp": time.time(),
                    "containers": current_data
                }
                for websocket in list(active_connections):
                    try:
                        await websocket.send_json(payload)
                    except WebSocketDisconnect:
                        active_connections.remove(websocket)
                    except Exception:
                        pass
                        
        except Exception as e:
            print(f"Error in metrics poller: {e}")
            
        await asyncio.sleep(1.5)

# API Endpoints
@app.get("/api/containers")
def get_containers():
    global MOCK_MODE, MOCK_CONTAINERS
    containers_list = []
    
    with stats_lock:
        if MOCK_MODE:
            for name, details in MOCK_CONTAINERS.items():
                containers_list.append({
                    "id": details["id"],
                    "name": details["name"],
                    "image": details["image"],
                    "status": details["status"],
                    "created": details["created"]
                })
        else:
            try:
                for c in docker_client.containers.list(all=True):
                    containers_list.append({
                        "id": c.short_id,
                        "name": c.name,
                        "image": c.image.tags[0] if c.image.tags else c.image.short_id,
                        "status": c.status,
                        "created": c.attrs.get("Created", "")
                    })
            except Exception as e:
                raise HTTPException(status_code=500, detail=str(e))
                
    return containers_list

@app.post("/api/containers/{container_id}/action")
def container_action(container_id: str, payload: ActionRequest):
    global MOCK_MODE, MOCK_CONTAINERS
    action = payload.action
    
    if action not in ["start", "stop", "restart"]:
        raise HTTPException(status_code=400, detail="Invalid action")
        
    with stats_lock:
        if MOCK_MODE:
            # Find container in mock database
            target = None
            for details in MOCK_CONTAINERS.values():
                if details["id"] == container_id or details["name"] == container_id:
                    target = details
                    break
                    
            if not target:
                raise HTTPException(status_code=404, detail="Container not found")
                
            old_status = target["status"]
            
            if action == "start":
                target["status"] = "running"
                timestamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                target["logs"].append(f"{timestamp} Container started manually.")
            elif action == "stop":
                target["status"] = "exited"
                target["cpu_usage"] = 0.0
                timestamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                target["logs"].append(f"{timestamp} Container stopped manually.")
            elif action == "restart":
                target["status"] = "running"
                target["cpu_usage"] = 0.0
                timestamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                target["logs"].append(f"{timestamp} Container restarted manually.")
                
            return {"success": True, "message": f"Container {action}ed successfully."}
        else:
            try:
                container = docker_client.containers.get(container_id)
                if action == "start":
                    container.start()
                elif action == "stop":
                    container.stop()
                elif action == "restart":
                    container.restart()
                return {"success": True, "message": f"Container {action}ed successfully."}
            except docker.errors.NotFound:
                raise HTTPException(status_code=404, detail="Container not found")
            except Exception as e:
                raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/containers/{container_id}/logs")
def get_container_logs(container_id: str, tail: int = 50):
    global MOCK_MODE, MOCK_CONTAINERS
    
    with stats_lock:
        if MOCK_MODE:
            target = None
            for details in MOCK_CONTAINERS.values():
                if details["id"] == container_id or details["name"] == container_id:
                    target = details
                    break
            if not target:
                raise HTTPException(status_code=404, detail="Container not found")
            return {"logs": "\n".join(target["logs"][-tail:])}
        else:
            try:
                container = docker_client.containers.get(container_id)
                logs_bytes = container.logs(stdout=True, stderr=True, tail=tail)
                return {"logs": logs_bytes.decode("utf-8", errors="ignore")}
            except docker.errors.NotFound:
                raise HTTPException(status_code=404, detail="Container not found")
            except Exception as e:
                raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/config")
def get_config():
    return app_config

@app.post("/api/config")
def update_config(payload: ConfigUpdate):
    global app_config
    app_config["webhook_url"] = payload.webhook_url.strip()
    app_config["docker_host"] = payload.docker_host.strip()
    save_config(app_config)
    
    # Re-initialize Docker connection dynamically
    connected = init_docker(app_config["docker_host"])
    
    # Test alert if webhook url is provided
    if app_config["webhook_url"]:
        send_webhook_alert(
            "monitor-system", 
            "docker-dashboard:latest", 
            "Configuration Telemetry Test", 
            f"Relay configuration updated. Docker connection status: {'CONNECTED' if connected else 'MOCK MODE'}."
        )
        
    return {
        "success": True, 
        "config": app_config,
        "docker_connected": connected,
        "is_mock": MOCK_MODE
    }

# WebSocket Endpoint
@app.websocket("/ws/metrics")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_connections.add(websocket)
    print(f"WebSocket client connected. Active: {len(active_connections)}")
    try:
        # Keep connection open
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        active_connections.remove(websocket)
        print(f"WebSocket client disconnected. Active: {len(active_connections)}")
    except Exception:
        if websocket in active_connections:
            active_connections.remove(websocket)

# HTML Router and Static Files Mount
# Serve static files folder
os.makedirs(os.path.join(os.path.dirname(os.path.abspath(__file__)), "static"), exist_ok=True)
app.mount("/static", StaticFiles(directory=os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")), name="static")

@app.get("/", response_class=HTMLResponse)
def get_index():
    index_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static", "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return HTMLResponse("<h1>Docker Dashboard Front-end is building...</h1><p>Please wait a few seconds and refresh.</p>")

from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    loop = asyncio.get_running_loop()
    poller_task = loop.create_task(metrics_poller())
    yield
    poller_task.cancel()

app.router.lifespan_context = lifespan

if __name__ == "__main__":
    import uvicorn
    # Start web server
    print("Starting FastAPI dashboard server on http://localhost:8000")
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=False)
