import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import VideoPlayer from './components/VideoPlayer';
import { apiBaseUrl, videoUrl } from './consts';
import { createJob, getEffects, getJob } from './api';

const App: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [selectedEffect, setSelectedEffect] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [useSample, setUseSample] = useState(false);
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [processedUrl, setProcessedUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
      setProcessedUrl(null);
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
      setProcessedUrl(`${apiBaseUrl}${jobQuery.data.resultUrl}?v=${Date.now()}`);
    }
    if (jobQuery.data?.status === 'failed' && jobQuery.data.error) {
      setErrorMessage(jobQuery.data.error);
    }
  }, [jobQuery.data]);

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

  const previewSrc = useMemo(() => {
    return processedUrl || localUrl || '';
  }, [processedUrl, localUrl]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setSelectedFile(file);
    setUseSample(false);
    setLocalUrl(null);
    setJobId(null);
    setProcessedUrl(null);
    setErrorMessage(null);
  };

  const handleUseSample = () => {
    setUseSample(true);
    setSelectedFile(null);
    setJobId(null);
    setProcessedUrl(null);
    setErrorMessage(null);
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
              {processedUrl ? 'Processed output' : 'Source video'}
            </div>
          </div>
          <div className="preview-body">
            {previewSrc ? (
              <VideoPlayer
                ref={videoRef}
                src={previewSrc}
                onLoadedMetadata={() => console.log('Video loaded')}
              />
            ) : (
              <div className="empty-state">
                <div className="empty-icon">⬤</div>
                <p>Upload a video to begin</p>
              </div>
            )}
          </div>
          {processedUrl && (
            <div className="preview-footer">
              <a className="link-button" href={processedUrl} download>
                Download processed video
              </a>
            </div>
          )}
        </section>

        <aside className="controls-panel">
          <div className="panel-card">
            <h3>Source</h3>
            <div className="upload-area">
              <label className="upload-input">
                <input type="file" accept="video/*" onChange={handleFileChange} />
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
            <button
              className="primary-button"
              type="button"
              onClick={() => createJobMutation.mutate()}
              disabled={isApplyDisabled}
            >
              {createJobMutation.isPending ? 'Uploading...' : 'Apply Effect'}
            </button>
          </div>

          <div className="panel-card">
            <h3>Status</h3>
            <div className="status-row">
              <span className="status-label">Job</span>
              <span className={`status-value status-${statusLabel}`}>{statusLabel}</span>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <p className="progress-text">{progress}% complete</p>
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
