@echo off
setlocal
title AQUENT Deploy

echo.
echo  ==========================================
echo    AQUENT ^| Deploy ke Firebase Hosting
echo  ==========================================
echo.

REM Check Node.js
where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js tidak ditemukan. Install dari https://nodejs.org
  pause & exit /b 1
)

REM Install Firebase CLI jika belum ada
where firebase >nul 2>&1
if errorlevel 1 (
  echo [INFO] Menginstall Firebase CLI...
  call npm install -g firebase-tools
  if errorlevel 1 ( echo [ERROR] Gagal install Firebase CLI. & pause & exit /b 1 )
)

REM Set service account untuk auth
set GOOGLE_APPLICATION_CREDENTIALS=%~dp0service-account.json

REM Cek file service account
if not exist "%GOOGLE_APPLICATION_CREDENTIALS%" (
  echo [ERROR] service-account.json tidak ditemukan di folder ini.
  pause & exit /b 1
)

echo [INFO] Menggunakan service account: %GOOGLE_APPLICATION_CREDENTIALS%
echo [INFO] Deploying ke project: aquent-id
echo.

REM Deploy
call firebase deploy --only hosting --project aquent-id

if errorlevel 1 (
  echo.
  echo [ERROR] Deploy gagal. Periksa koneksi dan izin service account.
  pause & exit /b 1
)

echo.
echo  ==========================================
echo    Deploy BERHASIL!
echo    URL: https://aquent-id.web.app
echo  ==========================================
echo.
pause
