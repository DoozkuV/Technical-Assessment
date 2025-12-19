import React from 'react';

type ExportStatusCardProps = {
  isExporting: boolean;
  statusLabel: string;
  progress: number;
  onExport: () => void;
  disabled: boolean;
  previewEnabled: boolean;
  previewReady: boolean;
  previewError: string | null;
  effectsError: boolean;
  errorMessage: string | null;
};

const ExportStatusCard: React.FC<ExportStatusCardProps> = ({
  isExporting,
  statusLabel,
  progress,
  onExport,
  disabled,
  previewEnabled,
  previewReady,
  previewError,
  effectsError,
  errorMessage,
}) => {
  return (
    <div className="panel-card">
      {isExporting ? (
        <>
          <div className="status-row">
            <span className="status-label">Rendering...</span>
            <span className={`status-value status-${statusLabel}`}>{statusLabel}</span>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <p className="progress-text">{progress}% complete</p>
          {previewEnabled && !previewReady && !previewError && (
            <div className="progress-text">Preview loading…</div>
          )}
        </>
      ) : (
        <button className="primary-button" type="button" onClick={onExport} disabled={disabled}>
          Export
        </button>
      )}
      {previewEnabled && previewError && <div className="error-banner">{previewError}</div>}
      {effectsError && <div className="error-banner">Unable to load effects list.</div>}
      {errorMessage && <div className="error-banner">{errorMessage}</div>}
    </div>
  );
};

export default ExportStatusCard;
