use std::fs;
use std::path::Path;
use tauri::command;

#[command]
pub async fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {}", e))
}

#[command]
pub async fn write_file(path: String, content: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create parent directory: {}", e))?;
    }
    fs::write(&path, content).map_err(|e| format!("Failed to write file: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;

    #[tokio::test]
    async fn test_read_write_file() {
        // Create a temp file
        let mut temp_file = NamedTempFile::new().expect("Failed to create temp file");
        let path = temp_file.path().to_str().expect("Path to str").to_string();
        
        // Write initial content via std::fs to verify read
        writeln!(temp_file, "Hello World").expect("Failed to write");
        
        let content = read_file(path.clone()).await.expect("read_file failed");
        assert_eq!(content, "Hello World\n");

        // Test write_file
        let new_content = "New Content";
        write_file(path.clone(), new_content.to_string()).await.expect("write_file failed");
        
        let content_after = std::fs::read_to_string(&path).expect("fs::read_to_string failed");
        assert_eq!(content_after, new_content);
    }
}