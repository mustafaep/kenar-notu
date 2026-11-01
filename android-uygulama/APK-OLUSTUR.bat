@echo off
if not "%~1"=="run" (
  cmd /k ""%~f0" run"
  exit /b
)
setlocal EnableExtensions EnableDelayedExpansion
title Kenar Notu - APK olusturuluyor
cd /d "%~dp0"

echo.
echo  ===============================================
echo    Kenar Notu  -  Android APK olusturma
echo  ===============================================
echo.

rem ---------- Hedef klasor ----------
set "TARGET=C:\Users\porta\OneDrive\Apk Dosyalar"
if not exist "%TARGET%" if defined OneDrive set "TARGET=%OneDrive%\Apk Dosyalar"
if not exist "%TARGET%" mkdir "%TARGET%"

rem ---------- Java (JDK 17 veya ustu) ----------
set "JAVA_OK="
if defined JAVA_HOME if exist "%JAVA_HOME%\bin\java.exe" set "JAVA_OK=1"
if not defined JAVA_OK if exist "%ProgramFiles%\Android\Android Studio\jbr\bin\java.exe" (set "JAVA_HOME=%ProgramFiles%\Android\Android Studio\jbr" & set "JAVA_OK=1")
if not defined JAVA_OK if exist "%~dp0.tools\jdk\bin\java.exe" (set "JAVA_HOME=%~dp0.tools\jdk" & set "JAVA_OK=1")
if not defined JAVA_OK (
  echo [1/4] Java bulunamadi. Eclipse Temurin JDK 17 indiriliyor ^(yaklasik 190 MB^)...
  if not exist ".tools" mkdir ".tools"
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -UseBasicParsing 'https://api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jdk/hotspot/normal/eclipse' -OutFile '.tools\jdk.zip'; Expand-Archive -Force '.tools\jdk.zip' '.tools\jdk-tmp'; $d = Get-ChildItem '.tools\jdk-tmp' -Directory | Select-Object -First 1; Move-Item $d.FullName '.tools\jdk'; Remove-Item -Recurse -Force '.tools\jdk-tmp','.tools\jdk.zip'"
  if not exist "%~dp0.tools\jdk\bin\java.exe" goto :fail_java
  set "JAVA_HOME=%~dp0.tools\jdk"
)
echo [1/4] Java: %JAVA_HOME%

rem ---------- Android SDK ----------
set "SDK="
if defined ANDROID_HOME if exist "%ANDROID_HOME%\platforms" set "SDK=%ANDROID_HOME%"
if not defined SDK if defined ANDROID_SDK_ROOT if exist "%ANDROID_SDK_ROOT%\platforms" set "SDK=%ANDROID_SDK_ROOT%"
if not defined SDK if exist "%LOCALAPPDATA%\Android\Sdk\platforms" set "SDK=%LOCALAPPDATA%\Android\Sdk"
if not defined SDK if exist "%~dp0.tools\sdk\cmdline-tools\latest\bin\sdkmanager.bat" set "SDK=%~dp0.tools\sdk"
if not defined SDK (
  echo [2/4] Android SDK bulunamadi. Komut satiri araclari indiriliyor ^(yaklasik 150 MB^)...
  if not exist ".tools\sdk" mkdir ".tools\sdk"
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -UseBasicParsing 'https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip' -OutFile '.tools\clt.zip'; Expand-Archive -Force '.tools\clt.zip' '.tools\sdk\cmdline-tools'; Rename-Item '.tools\sdk\cmdline-tools\cmdline-tools' 'latest'; Remove-Item '.tools\clt.zip'"
  if not exist "%~dp0.tools\sdk\cmdline-tools\latest\bin\sdkmanager.bat" goto :fail_sdk
  set "SDK=%~dp0.tools\sdk"
)
echo [2/4] Android SDK: %SDK%

set "SDKM=%SDK%\cmdline-tools\latest\bin\sdkmanager.bat"
if exist "%SDKM%" (
  echo       Lisanslar kabul ediliyor ve gerekli paketler kuruluyor...
  (for /l %%i in (1,1,20) do @echo y) | call "%SDKM%" --sdk_root="%SDK%" --licenses >nul 2>&1
  call "%SDKM%" --sdk_root="%SDK%" "platforms;android-34" "build-tools;34.0.0" "platform-tools" >nul
)

rem local.properties (ters bolu yerine duz bolu)
set "SDKF=%SDK:\=/%"
> local.properties echo sdk.dir=%SDKF%

rem ---------- Web dosyalari ----------
rem GitHub'dan yeni indirildiyse app\src\main\assets\www bos olur: ust klasordeki web uygulamasini oraya kopyala
if not exist "%~dp0app\src\main\assets\www\index.html" if exist "%~dp0..\index.html" (
  echo       Web dosyalari uygulamaya kopyalaniyor...
  robocopy "%~dp0.." "%~dp0app\src\main\assets\www" /E /XD android-uygulama .git .github docs _to_delete /XF README.md KURULUM.txt .gitignore /NFL /NDL /NJH /NJS /NP >nul
)
if not exist "%~dp0app\src\main\assets\www\index.html" (
  echo  HATA: app\src\main\assets\www klasorunde web uygulamasi yok.
  pause
  exit /b 1
)

rem ---------- Derleme ----------
echo [3/4] APK derleniyor. Ilk calistirmada Gradle ve Android eklentisi indirilir, 5-10 dakika surebilir...
if exist "app\build\outputs\apk\release" del /q "app\build\outputs\apk\release\*.apk" >nul 2>&1
call gradlew.bat --no-daemon assembleRelease
if errorlevel 1 goto :fail_build

set "APK="
for %%f in (app\build\outputs\apk\release\KenarNotu-*.apk) do (set "APK=%%f" & set "APKNAME=%%~nxf")
if not defined APK goto :fail_build

rem ---------- Kopyalama ----------
copy /y "%APK%" "%TARGET%\%APKNAME%" >nul
if exist "%~dp0KURULUM.txt" copy /y "%~dp0KURULUM.txt" "%TARGET%\KURULUM.txt" >nul
echo [4/4] Tamam! APK kaydedildi:
echo       %TARGET%\%APKNAME%
echo.
echo  Kurulum adimlari icin ayni klasordeki KURULUM.txt dosyasina bakin.
echo.
explorer "%TARGET%"
pause
exit /b 0

:fail_java
echo.
echo  HATA: Java indirilemedi. Internet baglantinizi kontrol edin ya da
echo  https://adoptium.net adresinden JDK 17 kurup bu dosyayi yeniden calistirin.
pause
exit /b 1

:fail_sdk
echo.
echo  HATA: Android SDK araclari indirilemedi. Internet baglantinizi kontrol edin ya da
echo  Android Studio kurup bu dosyayi yeniden calistirin.
pause
exit /b 1

:fail_build
echo.
echo  HATA: Derleme basarisiz oldu. Yukaridaki hata mesajini Claude'a iletebilirsiniz.
pause
exit /b 1
