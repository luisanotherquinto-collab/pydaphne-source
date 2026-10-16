@echo off
title The Act - recomp arcade
cd /d "%~dp0"
where py >nul 2>nul && (py -3 jugar_pc.py %*) || (python jugar_pc.py %*)
if errorlevel 1 pause
