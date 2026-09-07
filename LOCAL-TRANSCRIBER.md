# Free local transcription — WhisperHallu + WhisperTimeSync

AudioTags V1.6.2 does not require an OpenAI API key. The Cloudflare-hosted editor talks to a helper running only on your own computer at `127.0.0.1:8765`.

The helper **does not bundle or redistribute WhisperHallu or WhisperTimeSync**. Their GitHub repositories currently report no license, so the setup script clones the upstream projects directly into your local `local-transcriber/upstream/` folder. Check the upstream projects' terms before commercial redistribution.

## Windows — easiest setup

1. Open the project folder, then open `local-transcriber`.
2. Right-click `setup-windows.ps1` → **Run with PowerShell**.
3. The setup checks/installs Python, Git, FFmpeg and Java when Windows Package Manager (`winget`) is available.
4. It installs local Whisper/Demucs dependencies and clones:
   - https://github.com/EtienneAb3d/WhisperHallu
   - https://github.com/EtienneAb3d/WhisperTimeSync
5. Copy the pairing token shown at the end.
6. Double-click `start-windows.bat` and leave that window open.
7. In AudioTags, open **Local transcription**, paste the pairing token, click **Check connection**, then **Transcribe audio**.
8. If your browser asks for **loopback/local network permission**, choose **Allow** so the hosted app can reach the helper on your own computer.

The first transcription downloads the selected Whisper model. That can be a large download. `small` is the default because it is more practical on ordinary computers; `medium` is slower but can improve accuracy.

## macOS / Linux

Make sure Python 3, Git, FFmpeg and Java are installed. Then:

```bash
cd local-transcriber
./setup-macos-linux.sh
./start-macos-linux.sh
```

Copy the displayed pairing token into AudioTags.

## What happens locally

1. WhisperHallu performs its music-oriented preprocessing/transcription workflow.
2. WhisperTimeSync produces rough Whisper timestamps.
3. When Java alignment succeeds, WhisperTimeSync aligns the accurate text to those timestamps.
4. AudioTags receives only the finished text/timestamps from `127.0.0.1`; your audio is not sent to Cloudflare for transcription.

## Performance

This is local AI. A GPU is much faster. CPU-only transcription can take several minutes or longer for a full song, especially with `medium` models and Demucs vocal extraction.
