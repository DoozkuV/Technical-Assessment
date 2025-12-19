import React, { useEffect, useState } from 'react';
import VideoPlayer from './VideoPlayer';

type PreviewPanelProps = {
  previewSrc: string;
  previewBadge?: string;
  previewEnabled: boolean;
  videoRef: React.RefObject<HTMLVideoElement>;
  previewCanvasRef: React.RefObject<HTMLCanvasElement>;
  onLoadedMetadata?: () => void;
  fallback?: React.ReactNode;
};

const PreviewPanel: React.FC<PreviewPanelProps> = ({
  previewSrc,
  previewBadge = 'Preview',
  previewEnabled,
  videoRef,
  previewCanvasRef,
  onLoadedMetadata,
  fallback,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    const handleTimeUpdate = () => setCurrentTime(video.currentTime);
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleLoaded = () => {
      setDuration(video.duration || 0);
      setCurrentTime(video.currentTime || 0);
    };
    video.volume = volume;
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('loadedmetadata', handleLoaded);
    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('loadedmetadata', handleLoaded);
    };
  }, [previewSrc, videoRef, volume]);

  return (
    <section className="preview-panel">
      <div className="preview-body">
        {previewSrc ? (
          <div className="preview-stack">
            <VideoPlayer
              ref={videoRef}
              src={previewSrc}
              onLoadedMetadata={onLoadedMetadata}
            />
            <canvas
              ref={previewCanvasRef}
              className={`preview-canvas ${previewEnabled ? 'is-active' : ''}`}
            />
            <div className="preview-badge">{previewBadge}</div>
          </div>
        ) : (
          fallback || (
            <div className="empty-state">
              <div className="empty-icon">⬤</div>
              <p>Upload a video to begin</p>
            </div>
          )
        )}
      </div>
      {previewSrc && (
        <div className="control-bar">
          <button
            className="control-button"
            type="button"
            onClick={() => {
              const video = videoRef.current;
              if (!video) {
                return;
              }
              if (video.paused) {
                video.play();
                setIsPlaying(true);
              } else {
                video.pause();
                setIsPlaying(false);
              }
            }}
          >
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          <div className="time-range">
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.1}
              value={currentTime}
              onChange={(event) => {
                const video = videoRef.current;
                if (!video) {
                  return;
                }
                const next = Number(event.target.value);
                video.currentTime = next;
                setCurrentTime(next);
              }}
            />
          </div>
          <span className="time-label">
            {currentTime.toFixed(1)} / {duration.toFixed(1)}s
          </span>
          <input
            className="volume-range"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(event) => {
              const video = videoRef.current;
              if (!video) {
                return;
              }
              const next = Number(event.target.value);
              video.volume = next;
              setVolume(next);
            }}
          />
        </div>
      )}
    </section>
  );
};

export default PreviewPanel;
