import React from 'react';

interface FaceDetection {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  label?: string;
}

interface FaceDetectionOverlayProps {
  detections: FaceDetection[];
  videoRef: React.RefObject<HTMLVideoElement>;
}

const FaceDetectionOverlay: React.FC<FaceDetectionOverlayProps> = ({ 
  detections, 
  videoRef 
}) => {
  return (
    <div className="detection-overlay">
      {detections.map((detection) => (
        <div
          key={detection.id}
          className="face-box"
          style={{
            left: `${detection.x}px`,
            top: `${detection.y}px`,
            width: `${detection.width}px`,
            height: `${detection.height}px`,
          }}
        >
          {detection.label && (
            <div className="face-label">
              {detection.label} ({Math.round(detection.confidence * 100)}%)
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default FaceDetectionOverlay; 
