# Easy Rename

Drag-and-drop utility to match subtitle files (`.srt`/`.ass`/`.vtt`/…) to video files (`.mkv`/`.mp4`/…) by episode number, fix any mismatches by dragging, then rename each subtitle to match its video's name — keeping the subtitle's own extension.

Built with Tauri 2 + React + TypeScript. The Rust backend only lists directories and performs/undoes renames; all matching logic is pure TypeScript (unit-tested).

## Develop

```bash
pnpm install
pnpm tauri dev               # run the app
pnpm test                    # Vitest unit tests (TS matching logic)
cd src-tauri && cargo test   # Rust command tests
```

## Build a Windows installer

```bash
pnpm tauri build
```

Produces the raw `tauri-app.exe` binary at `src-tauri/target/release/` and an NSIS installer `Easy Rename_0.1.0_x64-setup.exe` under `src-tauri/target/release/bundle/nsis/`.

## Command-line use

Pass a folder as the first argument to launch straight into it — useful for automation (e.g. a script that processes one season at a time):

```bash
"Easy Rename.exe" "F:\Shows\Major\Season 2"
```

The app opens with that folder already loaded, exactly as if you'd dropped it. A missing path or a file (rather than a folder) is ignored, so the app falls back to the empty dropzone. Each launch is an independent window.

## How matching works

1. **Drop a folder** (or click to browse). Files are split into videos and subtitles by extension; everything else is ignored.
2. **Pick a regex pattern** with one capturing group that extracts the episode index from each filename. Presets: `(\d+)`, `E(\d+)`, `S\d+E(\d+)`, `-(\d+)`. Use **Shift** to correct off-by-one numbering.
3. **Auto-match** pairs subtitles to videos by index. Drag subtitles between rows to fix any wrong matches; click ✕ to unassign a subtitle.
4. **Review the rename preview** (old → new) and click **Rename**. **Undo last** reverts the most recent batch. On-conflict policy: **Skip** or **Overwrite**.

### Example

Videos `ep1.mkv … ep26.mkv` + subtitles `ep01.srt … ep26.srt` with pattern `(\d+)`:

- `ep1.mkv` ↔ `ep01.srt` (both extract index `1`) → subtitle renamed to `ep1.srt`
- `ep26.mkv` ↔ `ep26.srt` → subtitle renamed to `ep26.srt`

The subtitle keeps its own extension, so `.ass` subtitles become `ep1.ass`, `ep2.ass`, … matching their video.
