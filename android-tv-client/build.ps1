# Status ER TV — manual build script (no Gradle/Android Studio required)
# Requires: JDK 17+, Android SDK (cmdline-tools + platform-tools + build-tools + platforms;android-35)
# Usage:  powershell -File build.ps1

$ErrorActionPreference = "Stop"

$SDK = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { "C:\Users\MS-10\AppData\Local\Android\Sdk" }
$BT_VERSION = "35.0.1"
$PLATFORM_VERSION = "android-35"
$BT = "$SDK\build-tools\$BT_VERSION"
$PLATFORM_JAR = "$SDK\platforms\$PLATFORM_VERSION\android.jar"

$PROJ = $PSScriptRoot
$BUILD = "$PROJ\build"
$DIST = "$PROJ\dist"
$KEYSTORE_PROPS = "$PROJ\keystore\keystore.properties"

if (-not (Test-Path $PLATFORM_JAR)) { throw "Android platform not found: $PLATFORM_JAR" }
if (-not (Test-Path $KEYSTORE_PROPS)) { throw "Missing $KEYSTORE_PROPS — generate a keystore first (see keytool -genkeypair)" }

Write-Output "== Clean =="
Remove-Item -Recurse -Force "$BUILD" -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path "$BUILD\gen","$BUILD\classes","$BUILD\dex","$DIST" | Out-Null

Write-Output "== aapt2 compile resources =="
& "$BT\aapt2.exe" compile --dir "$PROJ\res" -o "$BUILD\compiled.zip"
if ($LASTEXITCODE -ne 0) { throw "aapt2 compile failed" }

Write-Output "== aapt2 link (resources + manifest -> base.apk, generate R.java) =="
& "$BT\aapt2.exe" link -o "$BUILD\base.apk" `
  -I $PLATFORM_JAR `
  --manifest "$PROJ\AndroidManifest.xml" `
  -R "$BUILD\compiled.zip" `
  --java "$BUILD\gen" `
  --min-sdk-version 26 `
  --target-sdk-version 35 `
  --version-code 1 `
  --version-name "1.0.0" `
  --auto-add-overlay
if ($LASTEXITCODE -ne 0) { throw "aapt2 link failed" }

Write-Output "== javac =="
$sources = Get-ChildItem -Recurse -Path "$PROJ\src","$BUILD\gen" -Filter *.java | ForEach-Object { $_.FullName }
$sources | Out-File -Encoding ascii "$BUILD\sources.txt"
& javac -encoding UTF-8 --release 8 -classpath $PLATFORM_JAR -d "$BUILD\classes" "@$BUILD\sources.txt"
if ($LASTEXITCODE -ne 0) { throw "javac failed" }

Write-Output "== d8 (dex) =="
$classFiles = Get-ChildItem -Recurse -Path "$BUILD\classes" -Filter *.class | ForEach-Object { $_.FullName }
& "$BT\d8.bat" --release --min-api 26 --output "$BUILD\dex" --lib $PLATFORM_JAR @classFiles
if ($LASTEXITCODE -ne 0) { throw "d8 failed" }

Write-Output "== merge dex into apk =="
Copy-Item "$BUILD\base.apk" "$BUILD\merged.apk" -Force
Push-Location "$BUILD\dex"
& jar uf "$BUILD\merged.apk" classes.dex
Pop-Location
if ($LASTEXITCODE -ne 0) { throw "jar merge failed" }

Write-Output "== zipalign =="
& "$BT\zipalign.exe" -f -p 4 "$BUILD\merged.apk" "$DIST\Status-ER-TV-unsigned.apk"
if ($LASTEXITCODE -ne 0) { throw "zipalign failed" }

Write-Output "== sign =="
$props = @{}
Get-Content $KEYSTORE_PROPS | ForEach-Object {
  if ($_ -match '^\s*([^=]+)=(.*)$') { $props[$matches[1].Trim()] = $matches[2].Trim() }
}
$ksFile = Join-Path "$PROJ\keystore" $props['storeFile']
& "$BT\apksigner.bat" sign `
  --ks $ksFile --ks-pass "pass:$($props['storePassword'])" `
  --key-pass "pass:$($props['keyPassword'])" --ks-key-alias $props['keyAlias'] `
  --out "$DIST\Status-ER-TV.apk" `
  "$DIST\Status-ER-TV-unsigned.apk"
if ($LASTEXITCODE -ne 0) { throw "apksigner sign failed" }

& "$BT\apksigner.bat" verify "$DIST\Status-ER-TV.apk" | Out-Null
if ($LASTEXITCODE -ne 0) { throw "apksigner verify failed" }

Write-Output ""
Write-Output "Build OK -> $DIST\Status-ER-TV.apk"
