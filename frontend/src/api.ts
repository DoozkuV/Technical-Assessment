import { apiBaseUrl } from './consts';

export interface EffectOption {
  id: string;
  label: string;
  preview?: {
    cssFilter?: string;
  };
}

export interface EffectsResponse {
  default: string;
  effects: EffectOption[];
}

export interface JobResponse {
  jobId: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  progress: number;
  resultUrl: string | null;
  error: string | null;
}

export const getEffects = async (): Promise<EffectsResponse> => {
  const response = await fetch(`${apiBaseUrl}/api/effects`);
  if (!response.ok) {
    throw new Error('Failed to load effects.');
  }
  return response.json();
};

export const createJob = async (file: File, effectId: string): Promise<{ jobId: string }> => {
  const formData = new FormData();
  formData.append('video', file);
  formData.append('effect', effectId);

  const response = await fetch(`${apiBaseUrl}/api/jobs`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Failed to create job.');
  }

  return response.json();
};

export const getJob = async (jobId: string): Promise<JobResponse> => {
  const response = await fetch(`${apiBaseUrl}/api/jobs/${jobId}`);
  if (!response.ok) {
    throw new Error('Failed to fetch job status.');
  }
  return response.json();
};
