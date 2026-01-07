#[cfg(test)]
pub fn format_typescript_bindings() {
    use std::path::PathBuf;
    use std::process::Command;

    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let workspace_root = manifest_dir
        .parent()
        .expect("core crate should live under workspace root");

    let status = Command::new("pnpm")
        .current_dir(workspace_root)
        .args(["biome", "format", "--write", "client/src/types/generated"])
        .status();

    match status {
        Ok(result) if result.success() => {}
        Ok(result) => panic!("Biome format failed with status: {result}"),
        Err(error) => panic!("Failed to run Biome format: {error}"),
    }
}
