@echo off
cd /d "%~dp0frontend"
set NEXT_PUBLIC_API_BASE_URL=http://localhost:8001
npm.cmd run dev -- -p 3001 > "%~dp0tmp\next-3d.out.log" 2> "%~dp0tmp\next-3d.err.log"
