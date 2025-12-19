import React from 'react';
import { EffectOption } from '../api';

type VideoStats = {
  width: number;
  height: number;
  duration: number;
  sizeMb: number | null;
};

type EffectsCardProps = {
  effects: EffectOption[];
  selectedEffect: string;
  onChange: (value: string) => void;
  loading: boolean;
  videoStats: VideoStats | null;
};

const EffectsCard: React.FC<EffectsCardProps> = ({
  effects,
  selectedEffect,
  onChange,
  loading,
  videoStats,
}) => {
  return (
    <div className="panel-card">
      <h3>Effects</h3>
      <div className="field">
        <label htmlFor="effect">Background effect</label>
        <select
          id="effect"
          value={selectedEffect}
          onChange={(event) => onChange(event.target.value)}
          disabled={loading}
        >
          {effects.map((effect) => (
            <option key={effect.id} value={effect.id}>
              {effect.label}
            </option>
          ))}
          {!effects.length && <option>Loading effects...</option>}
        </select>
      </div>
      {videoStats && (
        <div className="stats-list">
          <div className="stat-row">
            <span>Resolution</span>
            <span>
              {videoStats.width}×{videoStats.height}
            </span>
          </div>
          <div className="stat-row">
            <span>Duration</span>
            <span>{videoStats.duration.toFixed(1)}s</span>
          </div>
          <div className="stat-row">
            <span>Size</span>
            <span>{videoStats.sizeMb ? `${videoStats.sizeMb.toFixed(1)} MB` : '—'}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default EffectsCard;
