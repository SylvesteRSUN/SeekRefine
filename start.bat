@echo off
echo === SeekRefine - Starting up ===

:: Check Python venv
if not exist ".venv\Scripts\activate.bat" (
    echo Creating Python virtual environment...
    python -m venv .venv
)

:: Install backend dependencies
echo Installing backend dependencies...
call .venv\Scripts\activate.bat
pip install -r backend\requirements.txt -q

:: Install frontend dependencies
if not exist "frontend\node_modules" (
    echo Installing frontend dependencies...
    cd frontend
    npm install
    cd ..
)

:: Start backend
echo Starting backend server on http://localhost:8000 ...
start "SeekRefine-Backend" cmd /c ".venv\Scripts\activate.bat && cd backend && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"

:: Start frontend
echo Starting frontend dev server on http://localhost:5173 ...
start "SeekRefine-Frontend" cmd /c "cd frontend && npm run dev"

:: Wait for frontend to be ready, then open browser
echo Waiting for frontend to start...
timeout /t 3 /nobreak >nul
start http://localhost:5173

echo.
echo === SeekRefine is running! ===
echo Backend:  http://localhost:8000/docs
echo Frontend: http://localhost:5173
echo.
pause
