@echo off
setlocal

for %%i in ("%~dp0.") do set "APP_HOME=%%~fi"
set "DIST_URL=https://services.gradle.org/distributions/gradle-8.14.3-all.zip"
set "DIST_ROOT=%USERPROFILE%\.gradle\wrapper\dists"
set "DIST_DIR=%DIST_ROOT%\gradle-8.14.3"
set "ZIP_PATH=%DIST_ROOT%\gradle-8.14.3-all.zip"
set "BIN_PATH=%DIST_DIR%\bin\gradle.bat"

if not exist "%DIST_ROOT%" mkdir "%DIST_ROOT%"

if not exist "%BIN_PATH%" (
  if not exist "%ZIP_PATH%" (
    powershell -NoProfile -Command "Invoke-WebRequest -Uri '%DIST_URL%' -OutFile '%ZIP_PATH%'"
  )
  powershell -NoProfile -Command "Expand-Archive -Path '%ZIP_PATH%' -DestinationPath '%DIST_ROOT%' -Force"
)

call "%BIN_PATH%" -p "%APP_HOME%" %*
exit /b %ERRORLEVEL%