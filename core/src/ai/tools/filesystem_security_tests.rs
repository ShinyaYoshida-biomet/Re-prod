use super::*;
use tempfile::TempDir;
use tokio::fs;

#[tokio::test]
async fn test_absolute_path_attack() {
    let temp = TempDir::new().unwrap();
    let tool = FileSystemTool::new(temp.path().to_path_buf());

    // Try various absolute path attacks
    let attacks = vec![
        "/etc/passwd",
        "/etc/shadow",
        "/home/user/.ssh/id_rsa",
        "C:\\Windows\\System32\\config\\SAM",
        "/usr/bin/bash",
    ];

    for attack in attacks {
        let result = tool.validate_path(attack);
        assert!(
            result.is_err(),
            "Absolute path attack should be blocked: {}",
            attack
        );
        assert!(
            result
                .unwrap_err()
                .to_string()
                .contains("Absolute paths are not allowed"),
            "Wrong error message for: {}",
            attack
        );
    }
}

#[tokio::test]
async fn test_parent_directory_traversal_attacks() {
    let temp = TempDir::new().unwrap();
    let tool = FileSystemTool::new(temp.path().to_path_buf());

    let attacks = vec![
        "../../../etc/passwd",
        "../../etc/passwd",
        "../etc/passwd",
        "foo/../../../etc/passwd",
        "./../../etc/passwd",
        "..\\..\\..\\etc\\passwd",
        "foo\\..\\..\\..\\etc\\passwd",
        "data/../../../etc/passwd",
    ];

    for attack in attacks {
        let result = tool.validate_path(attack);
        assert!(
            result.is_err(),
            "Path traversal attack should be blocked: {}",
            attack
        );
        assert!(
            result
                .unwrap_err()
                .to_string()
                .contains("Parent directory references"),
            "Wrong error message for: {}",
            attack
        );
    }
}

#[tokio::test]
async fn test_symlink_escape_attack() {
    let temp = TempDir::new().unwrap();
    let workspace = temp.path();
    let tool = FileSystemTool::new(workspace.to_path_buf());

    // Create a directory outside workspace
    let outside_dir = TempDir::new().unwrap();
    let secret_file = outside_dir.path().join("secret.txt");
    fs::write(&secret_file, "SECRET DATA").await.unwrap();

    // Create a symlink in workspace pointing to outside file
    #[cfg(unix)]
    {
        let link_path = workspace.join("evil_link");
        std::os::unix::fs::symlink(&secret_file, &link_path).unwrap();

        let result = tool.validate_path("evil_link");
        assert!(result.is_err(), "Symlink escape attack should be blocked");
        assert!(
            result
                .unwrap_err()
                .to_string()
                .contains("outside workspace"),
            "Wrong error message for symlink escape"
        );
    }
}

#[tokio::test]
async fn test_valid_paths_allowed() {
    let temp = TempDir::new().unwrap();
    let workspace = temp.path();
    let tool = FileSystemTool::new(workspace.to_path_buf());

    // Create test files
    fs::write(workspace.join("test.txt"), "content")
        .await
        .unwrap();
    fs::create_dir_all(workspace.join("data")).await.unwrap();
    fs::write(workspace.join("data/file.csv"), "a,b,c")
        .await
        .unwrap();

    // These should all be allowed
    let valid_paths = vec!["test.txt", "data/file.csv", "./test.txt", "data/./file.csv"];

    for path in valid_paths {
        let result = tool.validate_path(path);
        assert!(
            result.is_ok(),
            "Valid path should be allowed: {} - error: {:?}",
            path,
            result.err()
        );
    }
}

#[tokio::test]
async fn test_list_files_security() {
    let temp = TempDir::new().unwrap();
    let workspace = temp.path();
    let tool = FileSystemTool::new(workspace.to_path_buf());

    // Try to list directories outside workspace
    let result = tool
        .list_files(ListFilesRequest {
            path: Some("../../etc".to_string()),
        })
        .await;

    assert!(
        result.is_err(),
        "Listing outside workspace should be blocked"
    );
}
