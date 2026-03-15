export interface CameraSettings {
  zoom: number;
  flash: boolean;
  timer: number;
  resolution: "720p" | "1080p" | "4K";
  facingMode: "user" | "environment";
  exposure: number;
  whiteBalance: "auto" | "sunny" | "cloudy" | "indoor";
  gridOverlay: boolean;
  focusMode: "auto" | "manual";
}

export const DEFAULT_SETTINGS: CameraSettings = {
  zoom: 1,
  flash: false,
  timer: 0,
  resolution: "1080p",
  facingMode: "environment",
  exposure: 0,
  whiteBalance: "auto",
  gridOverlay: false,
  focusMode: "auto",
};

export type CameraCommand =
  | { type: "capture"; timer: number }
  | { type: "toggleRecord" }
  | { type: "switchCamera" }
  | { type: "setZoom"; value: number }
  | { type: "setFlash"; enabled: boolean }
  | { type: "setTimer"; value: number }
  | { type: "setResolution"; value: "720p" | "1080p" | "4K" }
  | { type: "setExposure"; value: number }
  | { type: "setWhiteBalance"; value: string }
  | { type: "setGrid"; enabled: boolean }
  | { type: "setFocusMode"; value: string };

export interface PrimaryStatus {
  type: "status";
  isRecording: boolean;
  recordingDuration: number;
  capturedCount: number;
  settings: CameraSettings;
  supported: {
    torch: boolean;
    zoom: boolean;
    zoomMin: number;
    zoomMax: number;
  };
}

export interface SignalingState {
  roomCode: string;
  phase: "waiting" | "offered" | "answered" | "connected";
  primaryOffer: string | null;
  secondaryAnswer: string | null;
  primaryIce: string[];
  secondaryIce: string[];
  seq: number;
}

export type AppScreen = "role-select" | "primary" | "secondary";
