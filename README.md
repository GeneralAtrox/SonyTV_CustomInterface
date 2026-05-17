# Sony TV Custom Interface

Custom Android TV launcher for Sony BRAVIA / Android TV. It provides a compact app drawer, Plex widgets, Spotify controls, and a MilkDrop-style visualizer preview.

## Features

- Leanback launcher/home activity for Android TV
- Editable app grid with hidden-app preferences
- Plex continue-watching and recommendation widgets
- Spotify local media-session controls
- Full-screen Butterchurn/MilkDrop-style WebGL visualizer with Canvas fallback
- DreamService screensaver fallback using the Canvas visualizer

## Local Configuration

Private values are not committed. Copy `secrets.example.properties` to `secrets.properties` and fill in your own values:

```properties
PLEX_SERVER_URL_TV=http://YOUR_PLEX_SERVER_IP:32400
PLEX_SERVER_URL_EMULATOR=http://10.0.2.2:32400
PLEX_TOKEN=YOUR_PLEX_TOKEN
SPOTIFY_CLIENT_ID=YOUR_SPOTIFY_CLIENT_ID
```

Spotify local media-session controls can work without the Web API client ID, but browser-based Spotify API auth needs `SPOTIFY_CLIENT_ID`.

## Build

Open the project in Android Studio or build from PowerShell:

```powershell
$env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'
.\gradlew.bat assembleDebug
```

Install to a connected TV:

```powershell
adb install -r app\build\outputs\apk\debug\app-debug.apk
```

Grant audio capture permission if testing the visualizer:

```powershell
adb shell pm grant com.svjkr.sonytvlauncher android.permission.RECORD_AUDIO
```

## AVS Interpreter Check

The Winamp AVS/EEL interpreter can be checked locally without Android Studio:

```powershell
node tools\test-avs-eel.js
```

Scan installed Winamp AVS presets for supported effect stacks and EEL parser compatibility:

```powershell
node tools\scan-avs-presets.js "C:\Program Files (x86)\Winamp\Plugins\AVS"
```
