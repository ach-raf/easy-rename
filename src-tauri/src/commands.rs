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
}
