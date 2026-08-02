use serde::{Deserialize, Serialize};
use std::path::Path;

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

/// Progress emitted on the `rename_pairs` channel after each file is processed.
/// `total` is the input op count; `done` is how many have been handled so far
/// (applied + skipped + errored); `current` is the source path just handled.
/// Frontends can drive a progress bar off `done/total` without polling.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProgressEvent {
    pub done: usize,
    pub total: usize,
    pub current: String,
}

/// Apply a batch of renames. Pure (no AppHandle, no IPC channel) so it stays
/// unit-testable and reusable from `undo`. The Tauri `rename_pairs` command
/// wraps this loop and additionally streams `ProgressEvent`s over its channel.
fn apply_rename_batch(ops: Vec<RenameOp>, on_conflict: &str) -> RenameReport {
    let mut applied = Vec::new();
    let mut skipped = Vec::new();
    let mut errors = Vec::new();
    for op in ops {
        match apply_one(&op, on_conflict) {
            Ok(true) => applied.push(op),
            Ok(false) => skipped.push(op),
            Err(e) => errors.push(format!("{}: {}", op.src, e)),
        }
    }
    RenameReport { applied, skipped, errors }
}

#[tauri::command]
pub fn rename_pairs(
    ops: Vec<RenameOp>,
    on_conflict: String,
    on_progress: tauri::ipc::Channel<ProgressEvent>,
) -> Result<RenameReport, String> {
    let total = ops.len();
    let mut report = RenameReport { applied: Vec::new(), skipped: Vec::new(), errors: Vec::new() };
    for op in ops {
        let current = op.src.clone();
        match apply_one(&op, &on_conflict) {
            Ok(true) => report.applied.push(op),
            Ok(false) => report.skipped.push(op),
            Err(e) => report.errors.push(format!("{}: {}", current, e)),
        }
        let _ = on_progress.send(ProgressEvent {
            done: report.applied.len() + report.skipped.len() + report.errors.len(),
            total,
            current,
        });
    }
    Ok(report)
}

#[tauri::command]
pub fn undo(ops: Vec<RenameOp>) -> Result<RenameReport, String> {
    let reversed: Vec<RenameOp> = ops
        .into_iter()
        .rev()
        .map(|o| RenameOp { src: o.dest, dest: o.src })
        .collect();
    // Undo reuses the pure batch helper; no progress channel (typically a small,
    // fast batch the frontend treats as one shot).
    Ok(apply_rename_batch(reversed, "overwrite"))
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
        let report = apply_rename_batch(vec![op.clone()], "overwrite");
        assert_eq!(report.applied.len(), 1);
        let report = undo(report.applied).unwrap();
        assert_eq!(report.applied.len(), 1);
        assert!(src.exists(), "undo should restore original path");
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
