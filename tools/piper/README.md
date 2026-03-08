# Local Piper Binary

Place the Piper executable here:

`tools/piper/piper.exe`

Behavior:
- `start_codex_ui.bat` auto-sets `CODEX_PIPER_BIN` to this path.
- Runtime also prefers this path when `CODEX_PIPER_BIN` is not explicitly set.

Verification:

```bash
node scripts/piper_runtime_doctor.js --model en_US-lessac-high
```

Secure installer (hash-verified):

```powershell
powershell -ExecutionPolicy Bypass -File scripts/piper_secure_install.ps1 `
  -Url "<piper release .zip or .exe url>" `
  -Sha256 "<sha256>"
```
