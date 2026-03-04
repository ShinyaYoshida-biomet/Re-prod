use super::common::ApprovalRule;

pub(super) fn tool_requires_approval(name: &str) -> bool {
    matches!(name, "apply_pending_edit")
}

pub(super) fn normalize_relative_path(path: &str) -> Option<String> {
    use std::path::Component;
    let mut parts = Vec::new();
    let path = std::path::Path::new(path);
    for component in path.components() {
        match component {
            Component::Normal(part) => parts.push(part.to_string_lossy().to_string()),
            Component::CurDir => {}
            _ => return None,
        }
    }
    if parts.is_empty() {
        return None;
    }
    Some(parts.join("/"))
}

fn approval_prefix_from_path(path: &str) -> Option<String> {
    let normalized = normalize_relative_path(path)?;
    if let Some((parent, _)) = normalized.rsplit_once('/') {
        if !parent.is_empty() {
            return Some(parent.to_string());
        }
    }
    Some(normalized)
}

pub(super) fn build_approval_rule(tool: &str, path: Option<&str>) -> Option<ApprovalRule> {
    let path_prefix = path.and_then(approval_prefix_from_path);
    Some(ApprovalRule {
        tool: tool.to_string(),
        path_prefix,
    })
}
