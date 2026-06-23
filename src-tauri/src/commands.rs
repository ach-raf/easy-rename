use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::Manager;

#[derive(Serialize, Deserialize, Clone)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct RenameOp {
    pub src: String,
    pub dest: String,
}

#[derive(Serialize)]
pub struct RenameReport {
    pub applied: Vec<RenameOp>,
    pub skipped: Vec<RenameOp>,
    pub errors: Vec<String>,
}

/// A user-saveable regex quick-pick. Persisted as JSON in the app config dir.
#[derive(Serialize, Deserialize, Clone)]
pub struct Preset {
    pub label: String,
    pub pattern: String,
}

/// Where presets live: `<app_config_dir>/regex_presets.json`. Created on first
/// write; `app_config_dir` is stable across launches and survives reinstalls.
fn presets_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("regex_presets.json"))
}

/// The last-used Search & Replace inputs + active mode. Persisted as JSON in
/// the app config dir (camelCase keys to match the TS SearchReplaceOpts shape).
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LastRename {
    pub mode: String,
    pub search: String,
    pub replace: String,
    pub use_regex: bool,
    pub case_sensitive: bool,
    pub apply_to: String,
}

/// Where the last-run state lives: `<app_config_dir>/last_rename.json`.
fn last_rename_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("last_rename.json"))
}

/// Pure load (path-based) so it is unit-testable without an AppHandle.
/// Missing file (first run) and corrupt file both resolve to None.
fn load_last_rename_at(path: &Path) -> Option<LastRename> {
    match std::fs::read_to_string(path) {
        Ok(s) => serde_json::from_str(&s).ok(),
        Err(_) => None,
    }
}

/// Pure save (path-based): write a temp sibling then move, so a crash mid-write
/// cannot leave a half-written file behind. Mirrors save_presets.
fn save_last_rename_at(path: &Path, state: &LastRename) -> Result<(), String> {
    let s = serde_json::to_string_pretty(state).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, s).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, path).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn load_last_rename(app: tauri::AppHandle) -> Result<Option<LastRename>, String> {
    Ok(load_last_rename_at(&last_rename_file(&app)?))
}

#[tauri::command]
pub fn save_last_rename(app: tauri::AppHandle, state: LastRename) -> Result<(), String> {
    save_last_rename_at(&last_rename_file(&app)?, &state)
}

#[tauri::command]
pub fn load_presets(app: tauri::AppHandle) -> Result<Vec<Preset>, String> {
    let path = presets_file(&app)?;
    match std::fs::read_to_string(&path) {
        Ok(s) => serde_json::from_str(&s).map_err(|e| e.to_string()),
        // No file yet (first run) → empty; the frontend seeds defaults.
        Err(_) => Ok(Vec::new()),
    }
}

#[tauri::command]
pub fn save_presets(app: tauri::AppHandle, presets: Vec<Preset>) -> Result<(), String> {
    let path = presets_file(&app)?;
    let s = serde_json::to_string_pretty(&presets).map_err(|e| e.to_string())?;
    // Write to a sibling temp file then move, so a crash mid-write can't leave a
    // half-written (unparseable) presets file behind.
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, s).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn list_files(dir: String, recursive: bool) -> Result<Vec<FileEntry>, String> {
    let root = Path::new(&dir);
    let mut out = Vec::new();
    list_inner(root, recursive, &mut out).map_err(|e| e.to_string())?;
    Ok(out)
}

fn list_inner(dir: &Path, recursive: bool, out: &mut Vec<FileEntry>) -> std::io::Result<()> {
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        let meta = entry.metadata()?;
        let name = entry.file_name().to_string_lossy().into_owned();
        let path_s = path.to_string_lossy().into_owned();
        if meta.is_dir() {
            if recursive {
                list_inner(&path, recursive, out)?;
            } else {
                out.push(FileEntry { name, path: path_s, is_dir: true, size: 0 });
            }
        } else {
            out.push(FileEntry { name, path: path_s, is_dir: false, size: meta.len() });
        }
    }
    Ok(())
}

fn apply_one(op: &RenameOp, on_conflict: &str) -> Result<bool, String> {
    let src = Path::new(&op.src);
    let dest = Path::new(&op.dest);
    if dest.exists() {
        match on_conflict {
            "skip" => return Ok(false),
            "overwrite" => {
                if dest.is_dir() {
                    return Err("destination is a directory".into());
                }
                std::fs::remove_file(dest).map_err(|e| e.to_string())?;
            }
            _ => return Ok(false),
        }
    }
    std::fs::rename(src, dest).map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub fn rename_pairs(ops: Vec<RenameOp>, on_conflict: String) -> Result<RenameReport, String> {
    let mut applied = Vec::new();
    let mut skipped = Vec::new();
    let mut errors = Vec::new();
    for op in ops {
        match apply_one(&op, &on_conflict) {
            Ok(true) => applied.push(op),
            Ok(false) => skipped.push(op),
            Err(e) => errors.push(format!("{}: {}", op.src, e)),
        }
    }
    Ok(RenameReport { applied, skipped, errors })
}

#[tauri::command]
pub fn undo(ops: Vec<RenameOp>) -> Result<RenameReport, String> {
    let reversed: Vec<RenameOp> = ops
        .into_iter()
        .rev()
        .map(|o| RenameOp { src: o.dest, dest: o.src })
        .collect();
    rename_pairs(reversed, "overwrite".into())
}

/// Pick the first positional CLI arg iff it is an existing directory.
/// `args[0]` is the executable path and is skipped. Pure (takes a slice) so it
/// is unit-testable with `tempfile` without touching the real process args.
fn launch_folder_from_args(args: &[String]) -> Option<String> {
    let candidate = args.get(1)?;
    if Path::new(candidate).is_dir() {
        Some(candidate.clone())
    } else {
        None
    }
}

/// The folder the app was launched with via the command line
/// (`easyrename.exe <folder>`), or `None` when launched without a usable
/// directory argument. Read once by the frontend on mount so the app can open
/// straight into that folder.
#[tauri::command]
pub fn get_launch_folder() -> Option<String> {
    launch_folder_from_args(&std::env::args().collect::<Vec<_>>())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn touch(path: &std::path::Path) {
        fs::write(path, b"x").unwrap();
    }

    #[test]
    fn apply_one_skip_when_dest_exists() {
        let tmp = tempfile::tempdir().unwrap();
        let src = tmp.path().join("a.srt");
        let dest = tmp.path().join("b.srt");
        touch(&src);
        touch(&dest);
        let op = RenameOp { src: src.to_string_lossy().into_owned(), dest: dest.to_string_lossy().into_owned() };
        assert_eq!(apply_one(&op, "skip").unwrap(), false);
        assert!(src.exists(), "src must still exist on skip");
    }

    #[test]
    fn apply_one_overwrite_replaces_dest() {
        let tmp = tempfile::tempdir().unwrap();
        let src = tmp.path().join("a.srt");
        let dest = tmp.path().join("b.srt");
        fs::write(&src, b"new").unwrap();
        fs::write(&dest, b"old").unwrap();
        let op = RenameOp { src: src.to_string_lossy().into_owned(), dest: dest.to_string_lossy().into_owned() };
        assert_eq!(apply_one(&op, "overwrite").unwrap(), true);
        assert!(!src.exists());
        assert_eq!(fs::read_to_string(&dest).unwrap(), "new");
    }

    #[test]
    fn undo_reverses_applied_ops() {
        let tmp = tempfile::tempdir().unwrap();
        let src = tmp.path().join("orig.srt");
        let dest = tmp.path().join("renamed.srt");
        touch(&src);
        let op = RenameOp { src: src.to_string_lossy().into_owned(), dest: dest.to_string_lossy().into_owned() };
        let report = rename_pairs(vec![op.clone()], "overwrite".into()).unwrap();
        assert_eq!(report.applied.len(), 1);
        let report = undo(report.applied).unwrap();
        assert_eq!(report.applied.len(), 1);
        assert!(src.exists(), "undo should restore original path");
    }

    #[test]
    fn last_rename_round_trip() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("last_rename.json");
        let state = LastRename {
            mode: "searchReplace".into(), search: "S3".into(), replace: "S4".into(),
            use_regex: false, case_sensitive: true, apply_to: "both".into(),
        };
        save_last_rename_at(&path, &state).unwrap();
        let loaded = load_last_rename_at(&path).expect("should load after save");
        assert_eq!(loaded.search, "S3");
        assert!(loaded.case_sensitive);
        assert_eq!(loaded.apply_to, "both");
    }

    #[test]
    fn last_rename_missing_returns_none() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("nope.json");
        assert!(load_last_rename_at(&path).is_none());
    }

    #[test]
    fn last_rename_corrupt_returns_none() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("last_rename.json");
        std::fs::write(&path, b"{ not valid json").unwrap();
        assert!(load_last_rename_at(&path).is_none());
    }

    #[test]
    fn launch_folder_returns_existing_dir_arg() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().to_string_lossy().into_owned();
        let args = vec!["easyrename.exe".to_string(), dir.clone()];
        // Returns the arg verbatim (no canonicalization).
        assert_eq!(launch_folder_from_args(&args), Some(dir));
    }

    #[test]
    fn launch_folder_none_for_missing_path() {
        let args = vec!["easyrename.exe".to_string(), "Z:\\no\\such\\dir\\hopefully".into()];
        assert_eq!(launch_folder_from_args(&args), None);
    }

    #[test]
    fn launch_folder_none_for_file_arg() {
        let tmp = tempfile::tempdir().unwrap();
        let file = tmp.path().join("a.txt");
        std::fs::write(&file, b"x").unwrap();
        let file_s = file.to_string_lossy().into_owned();
        let args = vec!["easyrename.exe".to_string(), file_s];
        assert_eq!(launch_folder_from_args(&args), None);
    }

    #[test]
    fn launch_folder_none_without_positional_arg() {
        let args = vec!["easyrename.exe".to_string()];
        assert_eq!(launch_folder_from_args(&args), None);
    }
}
