use std::{
    collections::{HashMap, HashSet},
    path::{Path, PathBuf},
    sync::atomic::{AtomicBool, Ordering},
};

use tokio::sync::{oneshot, Mutex, Notify, RwLock};
use ts_rs::TS;

use super::common::ApprovalDecisionPayload;

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, Hash, PartialEq, Eq, TS)]
#[ts(export, export_to = "../../client/src/types/generated/")]
pub(super) struct ApprovalRule {
    pub tool: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path_prefix: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize)]
struct PersistentApprovalFile {
    version: u32,
    approvals: Vec<ApprovalRule>,
}

const APPROVALS_SCHEMA_VERSION: u32 = 1;

fn rule_matches(rule: &ApprovalRule, tool: &str, path: Option<&str>) -> bool {
    if rule.tool != tool {
        return false;
    }
    match (&rule.path_prefix, path) {
        (Some(prefix), Some(path)) => path == prefix || path.starts_with(&format!("{}/", prefix)),
        (None, None) => true,
        _ => false,
    }
}

pub struct ApprovalManager {
    pending: Mutex<HashMap<String, oneshot::Sender<ApprovalDecisionPayload>>>,
    session_allowlist: Mutex<HashMap<String, HashSet<ApprovalRule>>>,
    persistent_allowlist: Mutex<HashMap<String, HashSet<ApprovalRule>>>,
}

impl ApprovalManager {
    pub fn new() -> Self {
        Self {
            pending: Mutex::new(HashMap::new()),
            session_allowlist: Mutex::new(HashMap::new()),
            persistent_allowlist: Mutex::new(HashMap::new()),
        }
    }

    pub(super) async fn register(
        &self,
        event_id: String,
    ) -> oneshot::Receiver<ApprovalDecisionPayload> {
        let (tx, rx) = oneshot::channel();
        let mut pending = self.pending.lock().await;
        pending.insert(event_id, tx);
        rx
    }

    pub(super) async fn resolve(&self, decision: ApprovalDecisionPayload) -> bool {
        let tx = {
            let mut pending = self.pending.lock().await;
            pending.remove(&decision.event_id)
        };
        match tx {
            Some(sender) => sender.send(decision).is_ok(),
            None => false,
        }
    }

    pub(super) async fn is_allowed(
        &self,
        agent_session_id: &str,
        tool: &str,
        path: Option<&str>,
        project_root: &Path,
    ) -> bool {
        let session_allowed = {
            let allowlist = self.session_allowlist.lock().await;
            allowlist
                .get(agent_session_id)
                .map(|rules| rules.iter().any(|rule| rule_matches(rule, tool, path)))
                .unwrap_or(false)
        };
        if session_allowed {
            return true;
        }

        let persistent = self.load_persistent_allowlist(project_root).await;
        persistent.iter().any(|rule| rule_matches(rule, tool, path))
    }

    pub(super) async fn allow_for_session(&self, agent_session_id: &str, rule: ApprovalRule) {
        let mut allowlist = self.session_allowlist.lock().await;
        allowlist
            .entry(agent_session_id.to_string())
            .or_default()
            .insert(rule);
    }

    pub(super) async fn allow_persistent(
        &self,
        project_root: &Path,
        rule: ApprovalRule,
    ) -> Result<(), String> {
        let key = project_root.to_string_lossy().to_string();
        let _ = self.load_persistent_allowlist(project_root).await;
        let mut allowlist = self.persistent_allowlist.lock().await;
        let entry = allowlist.entry(key).or_insert_with(HashSet::new);
        if entry.insert(rule) {
            Self::save_persistent_allowlist(project_root, entry).map_err(|err| err.to_string())?;
        }
        Ok(())
    }

    async fn load_persistent_allowlist(&self, project_root: &Path) -> HashSet<ApprovalRule> {
        let key = project_root.to_string_lossy().to_string();
        {
            let allowlist = self.persistent_allowlist.lock().await;
            if let Some(rules) = allowlist.get(&key) {
                return rules.clone();
            }
        }

        let loaded = Self::read_persistent_allowlist(project_root).unwrap_or_default();
        let mut allowlist = self.persistent_allowlist.lock().await;
        allowlist.insert(key, loaded.clone());
        loaded
    }

    fn read_persistent_allowlist(project_root: &Path) -> Result<HashSet<ApprovalRule>, String> {
        let path = Self::persistent_allowlist_path(project_root)?;
        if !path.exists() {
            return Ok(HashSet::new());
        }
        let content = std::fs::read_to_string(&path)
            .map_err(|err| format!("Failed to read approvals: {}", err))?;
        let parsed: PersistentApprovalFile = serde_json::from_str(&content)
            .map_err(|err| format!("Failed to parse approvals: {}", err))?;
        if parsed.version != APPROVALS_SCHEMA_VERSION {
            return Err("Unsupported approvals schema version".to_string());
        }
        Ok(parsed.approvals.into_iter().collect())
    }

    fn save_persistent_allowlist(
        project_root: &Path,
        approvals: &HashSet<ApprovalRule>,
    ) -> Result<(), String> {
        let path = Self::persistent_allowlist_path(project_root)?;
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|err| format!("Failed to create approvals dir: {}", err))?;
        }
        let payload = PersistentApprovalFile {
            version: APPROVALS_SCHEMA_VERSION,
            approvals: approvals.iter().cloned().collect(),
        };
        let content = serde_json::to_string_pretty(&payload)
            .map_err(|err| format!("Failed to serialize approvals: {}", err))?;
        std::fs::write(&path, content)
            .map_err(|err| format!("Failed to write approvals: {}", err))?;
        Ok(())
    }

    fn persistent_allowlist_path(project_root: &Path) -> Result<PathBuf, String> {
        Ok(project_root.join(".reprod").join("approvals.json"))
    }
}

pub struct CancelToken {
    cancelled: AtomicBool,
    notify: Notify,
}

impl CancelToken {
    pub fn new() -> Self {
        Self {
            cancelled: AtomicBool::new(false),
            notify: Notify::new(),
        }
    }

    pub fn cancel(&self) {
        if !self.cancelled.swap(true, Ordering::SeqCst) {
            self.notify.notify_waiters();
        }
    }

    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::SeqCst)
    }

    pub async fn wait(&self) {
        if self.is_cancelled() {
            return;
        }
        self.notify.notified().await;
    }
}

pub struct CancelManager {
    tokens: RwLock<HashMap<String, std::sync::Arc<CancelToken>>>,
}

impl CancelManager {
    pub fn new() -> Self {
        Self {
            tokens: RwLock::new(HashMap::new()),
        }
    }

    pub async fn register(&self, request_id: &str) -> std::sync::Arc<CancelToken> {
        let token = std::sync::Arc::new(CancelToken::new());
        let mut tokens = self.tokens.write().await;
        tokens.insert(request_id.to_string(), token.clone());
        token
    }

    pub async fn cancel(&self, request_id: &str) -> bool {
        let token = {
            let tokens = self.tokens.read().await;
            tokens.get(request_id).cloned()
        };
        if let Some(token) = token {
            token.cancel();
            return true;
        }
        false
    }

    pub async fn unregister(&self, request_id: &str) {
        let mut tokens = self.tokens.write().await;
        tokens.remove(request_id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn matches_prefix_rules() {
        let rule = ApprovalRule {
            tool: "write_text_file".to_string(),
            path_prefix: Some("src".to_string()),
        };
        assert!(rule_matches(&rule, "write_text_file", Some("src/app.ts")));
        assert!(rule_matches(&rule, "write_text_file", Some("src")));
        assert!(!rule_matches(&rule, "write_text_file", Some("src2/app.ts")));
        assert!(!rule_matches(&rule, "write_text_file", None));
        assert!(!rule_matches(&rule, "edit_text_file", Some("src/app.ts")));
    }

    #[tokio::test]
    async fn persists_and_loads_approvals() {
        let temp = tempdir().unwrap();
        let root = temp.path();
        let manager = ApprovalManager::new();
        let rule = ApprovalRule {
            tool: "write_text_file".to_string(),
            path_prefix: Some("src".to_string()),
        };

        manager
            .allow_persistent(root, rule.clone())
            .await
            .expect("persist rule");

        let manager = ApprovalManager::new();
        let allowed = manager
            .is_allowed("session-1", "write_text_file", Some("src/app.ts"), root)
            .await;
        assert!(allowed);
    }

    #[tokio::test]
    async fn cancel_manager_triggers_token() {
        let manager = CancelManager::new();
        let token = manager.register("req-1").await;
        assert!(!token.is_cancelled());
        assert!(manager.cancel("req-1").await);
        assert!(token.is_cancelled());
        manager.unregister("req-1").await;
        assert!(!manager.cancel("req-1").await);
    }
}
