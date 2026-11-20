@echo off
cd /d "%~dp0"
title 利用記録・請求書（試作版）

where node > nul 2>&1
if errorlevel 1 (
  echo Node.js が見つかりません。README の「はじめに1回だけ」を見てインストールしてください。
  pause
  exit /b 1
)

if not exist node_modules (
  echo 初回の準備をしています（数分かかります）...
  call npm install
  if errorlevel 1 (
    echo 準備に失敗しました。インターネット接続を確認してください。
    pause
    exit /b 1
  )
)

echo.
echo アプリを起動しています。しばらくするとブラウザが開きます。
echo 終了するときは、この黒い画面を閉じてください。
echo.
start "" cmd /c "timeout /t 6 > nul & start http://localhost:3000"
call npm run dev
pause
