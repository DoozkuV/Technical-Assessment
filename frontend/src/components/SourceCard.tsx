import React from 'react';

type SourceCardProps = {
  fileInputRef: React.RefObject<HTMLInputElement>;
  selectedFileName: string | null;
  useSample: boolean;
  onFileChange: React.ChangeEventHandler<HTMLInputElement>;
  onUseSample: () => void;
};

const SourceCard: React.FC<SourceCardProps> = ({
  fileInputRef,
  selectedFileName,
  useSample,
  onFileChange,
  onUseSample,
}) => {
  return (
    <div className="panel-card">
      <h3>Source</h3>
      <div className="upload-area">
        <label className="upload-input">
          <input ref={fileInputRef} type="file" accept="video/*" onChange={onFileChange} />
          <span>{selectedFileName ?? 'Choose a video file'}</span>
        </label>
        <button className="ghost-button" type="button" onClick={onUseSample}>
          Use provided sample video
        </button>
        {useSample && (
          <p className="hint">Sample video selected. It will be uploaded from the preset URL.</p>
        )}
      </div>
    </div>
  );
};

export default SourceCard;
