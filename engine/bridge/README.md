# WMix native bridge (experimental)

This Node.js bridge launches the native libobs process in `--control` mode and translates newline-delimited JSON commands into the engine's line protocol. It has **no network listener** and is not yet connected to the WMix React UI.

## Run

Build the libobs engine first, then from the repository root:

```powershell
node engine/bridge/wmix-bridge.mjs .\engine\build\obs\Release\wmix-obs-smoke.exe
```

Send one JSON object per line on stdin:

```json
{"id":1,"command":"STATUS"}
{"id":2,"command":"CUT"}
{"id":3,"command":"STATUS"}
{"id":4,"command":"QUIT"}
```

Replies are JSON lines containing `type`, `id`, `message` and `ok`. Startup logs from the native engine go to stderr. The bridge enforces a command allowlist and a bounded queue (100 messages).

**Limitations:** no timeout or restart recovery yet; process must be launched by a trusted local desktop host. Do not expose this protocol directly to remote clients or untrusted browser origins. The current libobs scenes are empty, so CUT switches scene objects but no visible video.
