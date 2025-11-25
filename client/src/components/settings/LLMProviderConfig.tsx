import React, { useState } from 'react';
import { useSettingsStore } from '../../core/state/slices/settingsStore';
import './LLMProviderConfig.css';

interface Props {
  providerName: string;
  displayName: string;
  models: string[];
  isConfigured: boolean;
  apiKeyMasked?: string;
}

export const LLMProviderConfig: React.FC<Props> = ({
  providerName,
  displayName,
  models,
  isConfigured,
  apiKeyMasked,
}) => {
  const { setApiKey, testConnection } = useSettingsStore();
  const [apiKey, setLocalApiKey] = useState('');
  const [isEditing, setIsEditing] = useState(!isConfigured);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle');

  const handleSave = async () => {
    if (!apiKey) return;
    await setApiKey(providerName, apiKey);
    setIsEditing(false);
    setLocalApiKey('');
  };

  const handleTest = async () => {
    setTestStatus('testing');
    const success = await testConnection(providerName);
    setTestStatus(success ? 'success' : 'failed');
    setTimeout(() => setTestStatus('idle'), 3000);
  };

  return (
    <div className="llm-provider-config">
      <div className="provider-header">
        <span className="provider-name">{displayName}</span>
        {isConfigured && <span className="status-badge success">Configured</span>}
      </div>
      
      <div className="config-row">
        <label>API Key:</label>
        {isEditing ? (
          <div className="input-group">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setLocalApiKey(e.target.value)}
              placeholder="sk-..."
            />
            <button onClick={handleSave} disabled={!apiKey}>Save</button>
            <button onClick={() => setIsEditing(false)} className="secondary">Cancel</button>
          </div>
        ) : (
          <div className="display-group">
            <span className="masked-key">{apiKeyMasked || 'Not configured'}</span>
            <button onClick={() => setIsEditing(true)} className="secondary">Update</button>
          </div>
        )}
      </div>

      <div className="actions-row">
        <div className="models-info">
          <small>Models: {models.join(', ')}</small>
        </div>
        <button 
          className={`test-button ${testStatus}`} 
          onClick={handleTest}
          disabled={!isConfigured || isEditing || testStatus === 'testing'}
        >
          {testStatus === 'testing' ? 'Testing...' : 
           testStatus === 'success' ? '✓ Working' : 
           testStatus === 'failed' ? '✗ Failed' : 'Test Connection'}
        </button>
      </div>
    </div>
  );
};
