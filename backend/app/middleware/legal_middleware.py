from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
import time
import json

class LegalDisclaimerMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        
        response = await call_next(request)
        
        process_time = time.time() - start_time
        response.headers["X-Process-Time"] = str(process_time)
        
        if request.url.path.startswith("/api/v1"):
            response.headers["X-Legal-Notice"] = "For informational purposes only. Not investment advice."
        
        return response
