import os

import uvicorn

from app.main import app


if __name__ == "__main__":
    uvicorn.run(
        app,
        host=os.getenv("BY_DL_HOST", "127.0.0.1"),
        port=int(os.getenv("BY_DL_PORT", "16333")),
        reload=False,
        log_level=os.getenv("BY_DL_LOG_LEVEL", "info").lower(),
    )
