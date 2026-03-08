from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter(tags=["websocket"])


class ConnectionManager:
    def __init__(self) -> None:
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict) -> None:
        disconnected: list[WebSocket] = []
        for websocket in self.active_connections:
            try:
                await websocket.send_json(message)
            except Exception:
                disconnected.append(websocket)
        for websocket in disconnected:
            self.disconnect(websocket)

    async def send_personal(self, websocket: WebSocket, message: dict) -> None:
        await websocket.send_json(message)


connection_manager = ConnectionManager()


async def _serve_socket(websocket: WebSocket) -> None:
    await connection_manager.connect(websocket)
    await connection_manager.send_personal(websocket, {"type": "queue_update", "queued": 0, "active": 0})
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        connection_manager.disconnect(websocket)
    except Exception:
        connection_manager.disconnect(websocket)


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    await _serve_socket(websocket)


@router.websocket("/ws/progress")
async def websocket_progress_endpoint(websocket: WebSocket) -> None:
    await _serve_socket(websocket)
