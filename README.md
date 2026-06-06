## Testing

The project includes automated tests to ensure all core features work correctly.

### Running Tests

```bash
pytest tests/test_app.py -v
```

**Test Coverage**:
- ✅ `test_read_root` - Verifies the root endpoint returns the dashboard (HTTP 200)
- ✅ `test_get_containers` - Verifies the containers endpoint returns mock data (HTTP 200)
- ✅ `test_get_config` - Verifies the config endpoint returns required fields (HTTP 200)

All tests pass successfully with mock container data, ensuring the dashboard operates correctly even without a real Docker connection.

---

## Running Locally

1. **Install Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

2. **Run the Dashboard**:
   ```bash
   python app.py
   ```

3. **Access the HUD**:
   Open your browser and navigate to:
   [http://localhost:8000](http://localhost:8000)

4. **Run Tests**:
   ```bash
   pytest tests/test_app.py -v
   ```

---

## Configuration

- **Docker Connection**: Click the settings icon in the top right header to change your Docker host (e.g., `unix:///var/run/docker.sock` or your Synology NAS IP/port).
- **Webhooks**: Provide your webhook URL in the settings panel. If a container stops or goes offline, an alert event will be POSTed to this endpoint.
- **Voice Preferences**: Toggle J.A.R.V.I.S. voice notifications, select different system voices, or configure language preferences directly from the settings panel.
