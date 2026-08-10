# Cybersecurity Threat Simulator Powered by AI

Product name: **Cascadyx**.

This project is a Cybersecurity Threat Simulator and Detection system built as a Final Year Project. It simulates network-level threat vectors by replaying traffic in an isolated environment, detects threats using a machine learning cascade, and visualizes outcomes in a real-time React-based dashboard.

## Project Structure

```text
Cybersecurity_Threat_Simulator_Powered_by_AI/
├── backend/                  # FastAPI Backend Application
│   ├── app/                  # Main application source code
│   │   ├── __init__.py
│   │   ├── main.py           # FastAPI entrypoint & routes
│   │   └── config.py         # App configurations & environment reading
│   ├── .env.example          # Environment template file
│   └── requirements.txt      # Python dependencies
├── frontend/                 # React + Vite + TypeScript Frontend App
│   ├── src/                  # React source code
│   └── package.json          # Node dependencies
├── data/                     # Data directory (Gitignored except structure)
│   ├── raw/                  # Raw PCAP and CSV datasets
│   └── cache/                # Processed feature arrays and trained model binaries
├── .gitignore                # Git ignore files configuration
├── CLAUDE.md                 # Developer commands and guidelines
└── README.md                 # Project documentation (this file)
```

## Getting Started

### Prerequisites
- Python 3.10 or higher
- Node.js 18 or higher (with npm)
- Git

---

### Backend Setup

1. **Navigate to backend and create a virtual environment**:
   ```bash
   cd backend
   python -m venv venv
   ```

2. **Activate the virtual environment**:
   - **Windows (PowerShell)**:
     ```powershell
     .\venv\Scripts\Activate.ps1
     ```
   - **macOS/Linux**:
     ```bash
     source venv/bin/activate
     ```

3. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

4. **Prepare environment variables**:
   ```bash
   cp .env.example .env
   # Open .env and add your GEMINI_API_KEYS (comma-separated, optional — the AI Assistant
   # falls back to rule-based answers if no keys are configured)
   ```

5. **Start the FastAPI backend server**:
   ```bash
   uvicorn app.main:app --reload --port 8000
   ```
   The backend API will be available at `http://127.0.0.1:8000` (Health Check: `http://127.0.0.1:8000/api/health`).

---

### Frontend Setup

1. **Navigate to frontend directory**:
   ```bash
   cd frontend
   ```

2. **Install node dependencies**:
   ```bash
   npm install
   ```

3. **Run the React + Vite development server**:
   ```bash
   npm run dev
   ```
   The frontend application will be running at `http://localhost:5173`. Open it in your web browser.
