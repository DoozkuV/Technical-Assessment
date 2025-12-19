import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import PreviewPanel from './components/PreviewPanel';
import SourceCard from './components/SourceCard';
import EffectsCard from './components/EffectsCard';
import ExportStatusCard from './components/ExportStatusCard';
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
  };

  const handleUseSample = () => {
    setUseSample(true);
    setSelectedFile(null);
    setJobId(null);
    setLastDownloadedJobId(null);
    setErrorMessage(null);
    setVideoStats(null);
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
        <PreviewPanel
          previewSrc={previewSrc}
          previewEnabled={previewEnabled}
          videoRef={videoRef}
          previewCanvasRef={previewCanvasRef}
          previewBadge="Preview"
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
          }}
          fallback={
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
          }
        />

        <aside className="controls-panel">
          <SourceCard
            fileInputRef={fileInputRef}
            selectedFileName={selectedFile?.name ?? null}
            useSample={useSample}
            onFileChange={handleFileChange}
            onUseSample={handleUseSample}
          />
          <EffectsCard
            effects={effectsQuery.data?.effects ?? []}
            selectedEffect={selectedEffect}
            onChange={setSelectedEffect}
            loading={effectsQuery.isLoading}
            videoStats={videoStats}
          />
          <ExportStatusCard
            isExporting={
              createJobMutation.isPending ||
              (jobQuery.data?.status !== undefined &&
                jobQuery.data.status !== 'done' &&
                jobQuery.data.status !== 'failed')
            }
            statusLabel={statusLabel}
            progress={progress}
            onExport={() => createJobMutation.mutate()}
            disabled={isApplyDisabled}
            previewEnabled={previewEnabled}
            previewReady={previewStatus.ready}
            previewError={previewStatus.error}
            effectsError={effectsQuery.isError}
            errorMessage={errorMessage}
          />
        </aside>
      </main>
    </div>
  );
};

export default App;
