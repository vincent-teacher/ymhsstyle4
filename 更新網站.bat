@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 正在更新「楊梅高中梅岡風」網站，請稍候…
python tools/build.py
if errorlevel 1 (
  echo.
  echo 更新失敗，請確認已安裝 Python 與 Pillow（pip install pillow）。
  pause
  exit /b 1
)
echo.
echo 更新完成，正在開啟網站…
start "" "%~dp0index.html"
timeout /t 3 >nul
