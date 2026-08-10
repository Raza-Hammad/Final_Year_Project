"""
===============================================================================
STUDENT EXPLANATORY GUIDE: ws_manager.py
===============================================================================
WHAT THIS FILE IS FOR:
----------------------
This file manages real-time WebSocket communication between the FastAPI backend and
the React frontend. Whenever the threat simulator runs or a packet is classified, this
file broadcasts the live detection telemetry to all connected web browser dashboards instantly.

KEY FUNCTIONALITIES:
--------------------
1. `ConnectionManager.connect()`: Accepts new WebSocket connection handshakes from dashboard users.
2. `ConnectionManager.disconnect()`: Safely cleans up connections when a user closes their tab.
3. `ConnectionManager.broadcast()`: Sends JSON threat detection payloads to all online UI clients.
4. `broadcast_detection()`: Formats telemetry events with ISO timestamps and triggers real-time UI updates.

LIBRARIES & TOOLS USED:
-----------------------
- `fastapi.WebSocket`: Manages persistent, bi-directional web socket connections.
- `datetime.datetime`: Timestamps events so the dashboard can render live timeline charts.
- `logging`: Tracks active client connection counts for debugging.
===============================================================================
"""

import logging
from datetime import datetime
from fastapi import WebSocket

logger = logging.getLogger(__name__)

class ConnectionManager:
    """Manages active live WebSocket connections for real-time telemetry."""
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"New client connected to WebSocket. Total clients: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            logger.info(f"Client disconnected from WebSocket. Total clients: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        """Sends a JSON-serializable dictionary to all active WebSocket clients."""
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.warning(f"Error broadcasting to client: {e}")
                disconnected.append(connection)
        for connection in disconnected:
            self.disconnect(connection)

# Global connection manager instance -- lives in its own module (rather than main.py)
# so both main.py and app.simulator.simulator can import it directly without one
# needing a deferred/circular import of the other.
manager = ConnectionManager()

async def broadcast_detection(result: dict):
    """Broadcasting helper to send threat classification results to the live feed."""
    event = {
        "event": "detection",
        "data": result,
        "timestamp": datetime.utcnow().isoformat()
    }
    await manager.broadcast(event)
