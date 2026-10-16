@echo off
cd /d "%~dp0"
where py >nul 2>nul && (py -3 jugar_pc.py --kiosk) || (python jugar_pc.py --kiosk)
