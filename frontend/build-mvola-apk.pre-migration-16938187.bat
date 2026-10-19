@echo off
setlocal

if "%JAVA_HOME%"=="" set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"

if "%ANDROID_HOME%"=="" if exist "%LOCALAPPDATA%\Android\Sdk" set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
if not exist "%ANDROID_HOME%\platforms\android-36.1" (
  echo Android SDK 36.1 is not installed.
  echo Install Android SDK Platform 36.1 and Build Tools, then run this file again.
  exit /b 1
)

echo sdk.dir=%ANDROID_HOME:\=/%>android\local.properties
pushd android
call gradlew.bat assembleDebug
if errorlevel 1 exit /b 1
popd

copy /y "android\app\build\outputs\apk\debug\app-debug.apk" "Mvola-Wallet-Demo.apk"
echo.
echo APK created: %CD%\Mvola-Wallet-Demo.apk
endlocal
