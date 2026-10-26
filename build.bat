REM BUNDLE=1: panel/daemon webpack inline all deps + language packs into a
REM single self-contained app.js, so no npm install is needed at runtime.
set BUNDLE=1

call npm run preview-build

rd /s /q "production-code"
rd /s /q ".\daemon\dist"
rd /s /q ".\daemon\production"
rd /s /q ".\panel\dist"
rd /s /q ".\panel\production"

echo "Build daemon..."
cd daemon
call npm run build

echo "Build panel..."
cd ../panel
call npm run build

echo "Build frontend (React UI)..."
cd ../frontend-react
call npm run build

echo "Collecting files..."
cd ..

mkdir "production-code"
mkdir "production-code\daemon"
mkdir "production-code\web"
mkdir "production-code\web\public"

copy ".\daemon\production\app.js" ".\production-code\daemon\app.js"
copy ".\daemon\production\app.js.map" ".\production-code\daemon\app.js.map"
copy ".\daemon\production\app-hash.txt" ".\production-code\daemon\app-hash.txt"
copy ".\daemon\production\app_map-hash.txt" ".\production-code\daemon\app_map-hash.txt"
copy ".\daemon\package.json" ".\production-code\daemon\package.json"
copy ".\daemon\package-lock.json" ".\production-code\daemon\package-lock.json"

copy ".\panel\production\app.js" ".\production-code\web\app.js"
copy ".\panel\production\app.js.map" ".\production-code\web\app.js.map"
copy ".\panel\production\app-hash.txt" ".\production-code\web\app-hash.txt"
copy ".\panel\production\app_map-hash.txt" ".\production-code\web\app_map-hash.txt"
copy ".\panel\package.json" ".\production-code\web\package.json"
copy ".\panel\package-lock.json" ".\production-code\web\package-lock.json"

REM SECURITY: keep the UI sourcemaps out of the served web root (CWE-540).
mkdir "production-code\frontend-sourcemaps"
move ".\frontend-react\dist\assets\*.map" ".\production-code\frontend-sourcemaps\"
xcopy ".\frontend-react\dist" ".\production-code\web\public" /E /I /H /Y

rd /s /q ".\panel\production"
rd /s /q ".\daemon\production"
rd /s /q ".\daemon\dist"  
rd /s /q ".\panel\dist" 
rd /s /q ".\frontend-react\dist" 

REM app.js is self-contained; no npm install needed. Copy per-platform external
REM runtime binaries (PTY / Zip-Tools) if present.
if exist ".\daemon\lib" xcopy ".\daemon\lib" ".\production-code\daemon\lib" /E /I /H /Y

echo "------------"
echo "Compilation completed!"
echo "Output Directory: ./production-code/"
echo "------------"

pause