#!/bin/bash
echo "=== SeekRefine - Starting up ==="

# Check Python venv
if [ ! -d ".venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv .venv
fi

# Install backend dependencies
echo "Installing backend dependencies..."
source .venv/bin/activate
pip install -r backend/requirements.txt -q

# Install frontend dependencies
if [ ! -d "frontend/node_modules" ]; then
    echo "Installing frontend dependencies..."
    cd frontend && npm install && cd ..
fi

# Start backend
echo "Starting backend server on http://localhost:8000 ..."
cd backend && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!
cd ..

# Start frontend
echo "Starting frontend dev server on http://localhost:5173 ..."
cd frontend && npm run dev &
FRONTEND_PID=$!
cd ..

# Wait for frontend, then open browser
sleep 1
if command -v xdg-open &>/dev/null; then
  xdg-open http://localhost:5173
elif command -v open &>/dev/null; then
  open http://localhost:5173
fi

echo ""
echo "=== SeekRefine is running! ==="
echo "Backend:  http://localhost:8000/docs"
echo "Frontend: http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop both servers"

# Cleanup on exit
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT
wait
