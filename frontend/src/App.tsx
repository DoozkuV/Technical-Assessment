import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import VideoPlayer from './components/VideoPlayer';
import { apiBaseUrl, videoUrl } from './consts';
import { createJob, getEffects, getJob } from './api';
import { usePreviewSegmentation } from './hooks/usePreviewSegmentation';

const App: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedEffect, setSelectedEffect] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [useSample, setUseSample] = useState(false);
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [lastDownloadedJobId, setLastDownloadedJobId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [videoStats, setVideoStats] = useState<{
    width: number;
    height: number;
    duration: number;
    sizeMb: number | null;
  } | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);

  const effectsQuery = useQuery({
    queryKey: ['effects'],
    queryFn: getEffects,
  });

  const jobQuery = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => getJob(jobId as string),
    enabled: Boolean(jobId),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) {
        return 1000;
      }
      return data.status === 'done' || data.status === 'failed' ? false : 1000;
    },
  });

  const createJobMutation = useMutation({
    mutationFn: async () => {
      setErrorMessage(null);
      const effectId = selectedEffect || effectsQuery.data?.default || 'bg_grayscale';
      if (useSample) {
        const response = await fetch(videoUrl);
        if (!response.ok) {
          throw new Error('Unable to fetch sample video.');
        }
        const blob = await response.blob();
        const sampleFile = new File([blob], 'sample-video.mp4', {
          type: blob.type || 'video/mp4',
        });
        return createJob(sampleFile, effectId);
      }
      if (!selectedFile) {
        throw new Error('Select a video before applying an effect.');
      }
      return createJob(selectedFile, effectId);
    },
    onSuccess: (data) => {
      setJobId(data.jobId);
    },
    onError: (error) => {
      if (error instanceof Error) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage('Failed to create the job.');
      }
    },
  });

  useEffect(() => {
    if (effectsQuery.data?.default && !selectedEffect) {
      setSelectedEffect(effectsQuery.data.default);
    }
  }, [effectsQuery.data, selectedEffect]);

  useEffect(() => {
    if (jobQuery.data?.status === 'done' && jobQuery.data.resultUrl) {
      const url = `${apiBaseUrl}${jobQuery.data.resultUrl}?v=${Date.now()}`;
      if (jobQuery.data.jobId !== lastDownloadedJobId) {
        window.open(url, '_blank', 'noopener');
        setLastDownloadedJobId(jobQuery.data.jobId);
      }
    }
    if (jobQuery.data?.status === 'failed' && jobQuery.data.error) {
      setErrorMessage(jobQuery.data.error);
    }
  }, [jobQuery.data, lastDownloadedJobId]);

  const previewSrc = useMemo(() => {
    return localUrl || '';
  }, [localUrl]);

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
  }, [previewSrc, volume]);

  useEffect(() => {
    if (!selectedFile) {
      return;
    }
    const url = URL.createObjectURL(selectedFile);
    setLocalUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [selectedFile]);

  useEffect(() => {
    if (useSample) {
      setLocalUrl(videoUrl);
    }
  }, [useSample]);

  const selectedEffectPreview = useMemo(() => {
    return effectsQuery.data?.effects.find((effect) => effect.id === selectedEffect)?.preview;
  }, [effectsQuery.data, selectedEffect]);

  const previewEnabled = Boolean(previewSrc) && selectedEffect !== 'none';
  const previewStatus = usePreviewSegmentation({
    videoRef,
    canvasRef: previewCanvasRef,
    effectId: selectedEffect,
    effectPreview: selectedEffectPreview,
    enabled: previewEnabled,
  });

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setSelectedFile(file);
    setUseSample(false);
    setLocalUrl(null);
    setJobId(null);
    setLastDownloadedJobId(null);
    setErrorMessage(null);
    setVideoStats(null);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  };

  const handleUseSample = () => {
    setUseSample(true);
    setSelectedFile(null);
    setJobId(null);
    setLastDownloadedJobId(null);
    setErrorMessage(null);
    setVideoStats(null);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  };

  const isApplyDisabled = createJobMutation.isPending || (!selectedFile && !useSample);
  const progress = jobQuery.data?.progress ?? (createJobMutation.isPending ? 5 : 0);
  const statusLabel = jobQuery.data?.status || (createJobMutation.isPending ? 'queued' : 'idle');

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Video ML Pipeline</p>
          <h1>Background Effects Studio</h1>
          <p className="subtitle">
            Upload a clip, isolate the subject, and restyle the scene in a single batch run.
          </p>
        </div>
        <div className="status-pill">
          <span className="status-dot" />
          API: {apiBaseUrl}
        </div>
      </header>

      <main className="editor">
        <section className="preview-panel">
          <div className="panel-header">
            <h2>Preview</h2>
            <div className="panel-meta">
              Live preview
            </div>
          </div>
          <div className="preview-body">
            {previewSrc ? (
              <div className="preview-stack">
                <VideoPlayer
                  ref={videoRef}
                  src={previewSrc}
                  onLoadedMetadata={() => {
                    const el = videoRef.current;
                    if (!el) {
                      return;
                    }
                    const sizeMb = selectedFile ? selectedFile.size / (1024 * 1024) : null;
      setVideoStats({
        width: el.videoWidth,
        height: el.videoHeight,
        duration: el.duration,
        sizeMb,
      });
      setDuration(el.duration || 0);
    }}
                />
                <canvas
                  ref={previewCanvasRef}
                  className={`preview-canvas ${previewEnabled ? 'is-active' : ''}`}
                />
                <div className="preview-badge">Preview</div>
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-icon">⬤</div>
                <p>Upload a video to begin</p>
                <div className="empty-actions">
                  <button className="primary-button" type="button" onClick={handleUseSample}>
                    Use provided sample video
                  </button>
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Upload a video
                  </button>
                </div>
              </div>
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

        <aside className="controls-panel">
          <div className="panel-card">
            <h3>Source</h3>
            <div className="upload-area">
              <label className="upload-input">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  onChange={handleFileChange}
                />
                <span>{selectedFile ? selectedFile.name : 'Choose a video file'}</span>
              </label>
              <button className="ghost-button" type="button" onClick={handleUseSample}>
                Use provided sample video
              </button>
              {useSample && (
                <p className="hint">Sample video selected. It will be uploaded from the preset URL.</p>
              )}
            </div>
          </div>

          <div className="panel-card">
            <h3>Effects</h3>
            <div className="field">
              <label htmlFor="effect">Background effect</label>
              <select
                id="effect"
                value={selectedEffect}
                onChange={(event) => setSelectedEffect(event.target.value)}
                disabled={effectsQuery.isLoading}
              >
                {effectsQuery.data?.effects.map((effect) => (
                  <option key={effect.id} value={effect.id}>
                    {effect.label}
                  </option>
                ))}
                {!effectsQuery.data && <option>Loading effects...</option>}
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

          <div className="panel-card">
            <h3>Status</h3>
            {(jobQuery.data?.status && jobQuery.data.status !== 'done' && jobQuery.data.status !== 'failed') ||
            createJobMutation.isPending ? (
              <>
                <div className="status-row">
                  <span className="status-label">Job</span>
                  <span className={`status-value status-${statusLabel}`}>{statusLabel}</span>
                </div>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${progress}%` }} />
                </div>
                <p className="progress-text">{progress}% complete</p>
                {previewEnabled && !previewStatus.ready && !previewStatus.error && (
                  <div className="progress-text">Preview loading…</div>
                )}
              </>
            ) : (
              <button
                className="primary-button"
                type="button"
                onClick={() => createJobMutation.mutate()}
                disabled={isApplyDisabled}
              >
                Export
              </button>
            )}
            {previewEnabled && previewStatus.error && (
              <div className="error-banner">{previewStatus.error}</div>
            )}
            {effectsQuery.isError && (
              <div className="error-banner">Unable to load effects list.</div>
            )}
            {errorMessage && <div className="error-banner">{errorMessage}</div>}
          </div>
        </aside>
      </main>
    </div>
  );
};

export default App;
