# J.A.R.V.I.S. // Docker Monitor Dashboard

A state-of-the-art, real-time Docker container monitoring dashboard inspired by the **J.A.R.V.I.S. (Iron Man)** holographic HUD. It features glowing visuals, audio synthesis, text-to-speech feedback, multi-language support (English & Hebrew RTL), webhook alerts, and remote Synology NAS auto-mapping.

![Dashboard Demo](https://img.shields.io/badge/Theme-J.A.R.V.I.S.%20HUD-cyan?style=for-the-badge)
![FastAPI](https://img.shields.io/badge/Backend-FastAPI-green?style=for-the-badge)
![JavaScript](https://img.shields.io/badge/Frontend-Vanilla%20JS-blue?style=for-the-badge)

---

## Key Features

1. **J.A.R.V.I.S. Cybernetic Interface**: 
   - Obsidian dark UI with translucent glassmorphic elements, neon glowing borders, scanlines, and diagnostic arc reactor rings.
   - Micro-interactions, visual charts (CPU & Memory), and dynamic console output.
2. **Text-to-Speech (TTS) & Synth Audio (SFX)**:
   - J.A.R.V.I.S. vocalizes container status updates (e.g. startup, shutdowns, warnings).
   - Audio feedback is dynamically localized based on your selected language (English / Hebrew).
   - Custom synthesized sci-fi sound effects built using the browser's Web Audio API.
3. **Multi-Language Support (Localization)**:
   - Fully supports **English** and **Hebrew (RTL)** layout mirroring.
4. **Remote Synology & Custom NAS Auto-Mapping**:
   - Easily connect to a remote Synology NAS (e.g., `http://192.168.50.193:5000/`).
   - J.A.R.V.I.S. automatically resolves the management port and maps it to Docker's standard TCP port (`tcp://192.168.50.193:2375`).
5. **Mock/Simulation Mode**:
   - If a local or remote Docker daemon is offline/inaccessible, the dashboard dynamically activates Mock Mode so you can preview telemetry, metrics trends, container actions, and alert dispatchers immediately.
6. **Webhook Alerts**:
   - Send instant JSON payloads to n8n, Slack, Discord, or any custom webhook endpoint when a container unexpected exits or changes state.

---

## Tech Stack

- **Backend**: Python 3.10+, FastAPI (using modern `lifespan` event loop management), Docker SDK for Python.
- **Frontend**: HTML5, Vanilla CSS, Vanilla JavaScript, Chart.js.
- **APIs Used**: Web Speech API (SpeechSynthesis), Web Audio API, WebSockets (for live metric telemetry).

---

## Installation & Setup

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/OMRITGM/docker-monitor-dashboard.git
   cd docker-monitor-dashboard
   ```

2. **Install Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Run the Dashboard**:
   ```bash
   python app.py
   ```

4. **Access the HUD**:
   Open your browser and navigate to:
   [http://localhost:8000](http://localhost:8000)

---

## Configuration

- **Docker Connection**: Click the settings icon in the top right header to change your Docker host (e.g., `unix:///var/run/docker.sock` or your Synology NAS IP/port).
- **Webhooks**: Provide your webhook URL in the settings panel. If a container stops or goes offline, an alert event will be POSTed to this endpoint.
- **Voice Preferences**: Toggle J.A.R.V.I.S. voice notifications, select different system voices, or configure language preferences directly from the settings panel.
