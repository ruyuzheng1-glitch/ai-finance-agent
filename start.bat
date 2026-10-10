@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ==============================================
echo   正在启动 AI 个人财务管家 Agent
echo   启动成功后浏览器打开 http://localhost:3000
echo   按 Ctrl+C 或关闭本窗口即可停止
echo ==============================================
node server.js
pause
