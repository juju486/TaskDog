@echo off
setlocal enabledelayedexpansion

echo [TaskDog] 正在结束项目相关进程...

rem 1) 通过窗口标题（start.bat 启动时使用的标题）
for %%T in ("TaskDog Backend" "TaskDog Frontend") do (
  taskkill /FI "WINDOWTITLE eq %%~T" /F /T >nul 2>&1
)

rem 2) 通过端口（后端:3001，前端:3000）
for %%P in (3001 3000) do (
  for /f "tokens=5" %%a in ('netstat -ano ^| findstr /R /C:":%%P[ ].*LISTENING"') do (
    set PID=%%a
    if not "!PID!"=="" (
      echo  结束端口 %%P 的进程 PID=!PID!
      taskkill /PID !PID! /F /T >nul 2>&1
    )
  )
)

rem 3) 兜底：使用 PowerShell 按命令行包含路径匹配（可能需要管理员）
for /f "tokens=*" %%# in ('where powershell 2^>nul') do (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Try { Get-CimInstance Win32_Process ^| Where-Object {($_.CommandLine -match 'TaskDog\\\\backend' -or $_.CommandLine -match 'TaskDog\\\\frontend') -and ($_.Name -match 'node|cmd|npm|vite') } ^| ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } } Catch { }" >nul 2>&1
  goto after_ps
)
:after_ps

echo [TaskDog] 结束操作完成。
exit /b 0
