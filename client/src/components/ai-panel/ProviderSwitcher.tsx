import React from 'react';
import { useSettingsStore } from '../../core/state/slices/settingsStore';
import './ProviderSwitcher.css';

export const ProviderSwitcher: React.FC = () => {
  const { activeProvider, providers, setActiveProvider } = useSettingsStore();
  
  // We want to show the display name of the active provider
  const currentProvider = providers.find(p => p.name === activeProvider);

  return (
    <div className="provider-switcher">
      <select 
        value={activeProvider}
        onChange={(e) => setActiveProvider(e.target.value)}
        className="switcher-select"
      >
        {providers.map(p => (
          <option key={p.name} value={p.name}>
            {p.displayName}
          </option>
        ))}
      </select>
      {currentProvider && !currentProvider.isConfigured && (
        <span className="warning-icon" title="Provider not configured">⚠️</span>
      )}
    </div>
  );
};
