import {
  ArrowLeft,
  Check,
  Circle,
  Copy,
  ImageIcon,
  RotateCcw,
  Square,
  Wifi,
  WifiOff,
  X,
  Zap,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useActor } from "../hooks/useActor";
import { useSignaling } from "../hooks/useSignaling";
import type { CameraCommand, CameraSettings, PrimaryStatus } from "../types";
import { DEFAULT_SETTINGS } from "../types";

const RESOLUTIONS: Record<string, { width: number; height: number }> = {
  "720p": { width: 1280, height: 720 },
  "1080p": { width: 1920, height: 1080 },
  "4K": { width: 3840, height: 2160 },
};

const PULSE_DOTS = [0, 1, 2];

function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60)
    .toString()
    .padStart(2, "0");
  const s = (secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

interface Props {
  onBack: () => void;
}

export default function PrimaryFlow({ onBack }: Props) {
  const [phase, setPhase] = useState<"setup" | "camera" | "gallery">("setup");
  const [roomCode] = useState(generateRoomCode);
  const [copied, setCopied] = useState(false);
  const [connState, setConnState] = useState<
    "waiting" | "connecting" | "connected" | "failed"
  >("waiting");
  const [settings, setSettings] = useState<CameraSettings>(DEFAULT_SETTINGS);
  const [isRecording, setIsRecording] = useState(false);
  const [recDuration, setRecDuration] = useState(0);
  const [capturedPhotos, setCapturedPhotos] = useState<string[]>([]);
  const [capturedVideos, setCapturedVideos] = useState<string[]>([]);
  const [timerCount, setTimerCount] = useState(0);
  const [digitalZoom, setDigitalZoom] = useState(1);
  const [supported, setSupported] = useState({
    torch: false,
    zoom: false,
    zoomMin: 1,
    zoomMax: 8,
  });

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingPrimaryIceRef = useRef<string[]>([]);
  const addedSecondaryIceRef = useRef(0);
  const signalingWrittenRef = useRef(false);
  const settingsRef = useRef(settings);
  const isRecordingRef = useRef(isRecording);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);
  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  const { readSignaling, mergeWrite } = useSignaling();
  const { actor, isFetching } = useActor();

  const startCamera = useCallback(
    async (
      facingMode: "user" | "environment",
      resolution: "720p" | "1080p" | "4K",
    ) => {
      if (streamRef.current) {
        for (const t of streamRef.current.getTracks()) t.stop();
        streamRef.current = null;
      }
      try {
        const { width, height } = RESOLUTIONS[resolution];
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode,
            width: { ideal: width },
            height: { ideal: height },
          },
          audio: true,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        const track = stream.getVideoTracks()[0];
        const caps = track.getCapabilities() as any;
        setSupported({
          torch: !!caps.torch,
          zoom: !!caps.zoom,
          zoomMin: caps.zoom?.min ?? 1,
          zoomMax: caps.zoom?.max ?? 8,
        });
        return stream;
      } catch {
        toast.error("Camera permission denied or not available");
        return null;
      }
    },
    [],
  );

  useEffect(() => {
    startCamera(DEFAULT_SETTINGS.facingMode, DEFAULT_SETTINGS.resolution);
    return () => {
      if (streamRef.current) {
        for (const t of streamRef.current.getTracks()) t.stop();
      }
      if (pcRef.current) pcRef.current.close();
      if (recTimerRef.current) clearInterval(recTimerRef.current);
    };
  }, [startCamera]);

  useEffect(() => {
    if (isFetching || !actor || signalingWrittenRef.current) return;
    signalingWrittenRef.current = true;
    setupPrimary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actor, isFetching]);

  const capturePhoto = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (settingsRef.current.facingMode === "user") {
      ctx.scale(-1, 1);
      ctx.drawImage(video, -canvas.width, 0);
    } else {
      ctx.drawImage(video, 0, 0);
    }
    const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
    setCapturedPhotos((prev) => [dataUrl, ...prev]);
    toast.success("Photo captured!");
  }, []);

  const startRecording = useCallback(() => {
    if (!streamRef.current) return;
    chunksRef.current = [];
    let mimeType = "video/webm";
    if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = "video/mp4";
    try {
      const recorder = new MediaRecorder(streamRef.current, { mimeType });
      recorderRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        setCapturedVideos((prev) => [url, ...prev]);
        toast.success("Video saved!");
      };
      recorder.start(1000);
      setIsRecording(true);
      setRecDuration(0);
      recTimerRef.current = setInterval(
        () => setRecDuration((d) => d + 1),
        1000,
      );
    } catch {
      toast.error("Recording not supported on this device");
    }
  }, []);

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setIsRecording(false);
    if (recTimerRef.current) {
      clearInterval(recTimerRef.current);
      recTimerRef.current = null;
    }
  }, []);

  const executeCommand = useCallback(
    async (cmd: CameraCommand) => {
      switch (cmd.type) {
        case "capture": {
          if (cmd.timer > 0) {
            let count = cmd.timer;
            setTimerCount(count);
            const tid = setInterval(() => {
              count--;
              setTimerCount(count);
              if (count === 0) {
                clearInterval(tid);
                capturePhoto();
              }
            }, 1000);
          } else {
            capturePhoto();
          }
          break;
        }
        case "toggleRecord": {
          if (isRecordingRef.current) stopRecording();
          else startRecording();
          break;
        }
        case "switchCamera": {
          const cur = settingsRef.current;
          const newFacing =
            cur.facingMode === "environment" ? "user" : "environment";
          setSettings((s) => ({ ...s, facingMode: newFacing }));
          const newStream = await startCamera(newFacing, cur.resolution);
          if (newStream && pcRef.current) {
            const videoSender = pcRef.current
              .getSenders()
              .find((s) => s.track?.kind === "video");
            if (videoSender) {
              const newVideoTrack = newStream.getVideoTracks()[0];
              if (newVideoTrack) await videoSender.replaceTrack(newVideoTrack);
            }
          }
          break;
        }
        case "setZoom": {
          setSettings((s) => ({ ...s, zoom: cmd.value }));
          const track = streamRef.current?.getVideoTracks()[0];
          if (track) {
            const caps = track.getCapabilities() as any;
            if (caps.zoom) {
              const clamped = Math.min(
                Math.max(cmd.value, caps.zoom.min),
                caps.zoom.max,
              );
              await track.applyConstraints({
                advanced: [{ zoom: clamped } as any],
              });
            } else {
              setDigitalZoom(cmd.value);
            }
          }
          break;
        }
        case "setFlash": {
          setSettings((s) => ({ ...s, flash: cmd.enabled }));
          const track = streamRef.current?.getVideoTracks()[0];
          if (track) {
            const caps = track.getCapabilities() as any;
            if (caps.torch) {
              await track.applyConstraints({
                advanced: [{ torch: cmd.enabled } as any],
              });
            }
          }
          break;
        }
        case "setTimer":
          setSettings((s) => ({ ...s, timer: cmd.value }));
          break;
        case "setResolution": {
          const res = cmd.value as "720p" | "1080p" | "4K";
          setSettings((s) => ({ ...s, resolution: res }));
          await startCamera(settingsRef.current.facingMode, res);
          break;
        }
        case "setExposure":
          setSettings((s) => ({ ...s, exposure: cmd.value }));
          break;
        case "setWhiteBalance":
          setSettings((s) => ({
            ...s,
            whiteBalance: cmd.value as CameraSettings["whiteBalance"],
          }));
          break;
        case "setGrid":
          setSettings((s) => ({ ...s, gridOverlay: cmd.enabled }));
          break;
        case "setFocusMode":
          setSettings((s) => ({
            ...s,
            focusMode: cmd.value as CameraSettings["focusMode"],
          }));
          break;
      }
    },
    [capturePhoto, startCamera, startRecording, stopRecording],
  );

  const sendStatus = useCallback(() => {
    if (dcRef.current?.readyState === "open") {
      const status: PrimaryStatus = {
        type: "status",
        isRecording: isRecordingRef.current,
        recordingDuration: recDuration,
        capturedCount: capturedPhotos.length,
        settings: settingsRef.current,
        supported,
      };
      dcRef.current.send(JSON.stringify(status));
    }
  }, [recDuration, capturedPhotos.length, supported]);

  useEffect(() => {
    if (connState !== "connected") return;
    const id = setInterval(sendStatus, 1000);
    return () => clearInterval(id);
  }, [connState, sendStatus]);

  const setupPrimary = async () => {
    await mergeWrite(roomCode, {
      roomCode,
      phase: "waiting",
      primaryOffer: null,
      secondaryAnswer: null,
      primaryIce: [],
      secondaryIce: [],
      seq: 0,
    });

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ],
    });
    pcRef.current = pc;

    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        pc.addTrack(track, streamRef.current);
      }
    }

    const dc = pc.createDataChannel("commands", { ordered: true });
    dcRef.current = dc;
    dc.onopen = () => {
      setConnState("connected");
      setPhase("camera");
    };
    dc.onmessage = (e) => {
      try {
        const cmd = JSON.parse(e.data) as CameraCommand;
        executeCommand(cmd);
      } catch {}
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        pendingPrimaryIceRef.current.push(JSON.stringify(e.candidate.toJSON()));
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    await mergeWrite(roomCode, {
      roomCode,
      phase: "offered",
      primaryOffer: JSON.stringify({ type: offer.type, sdp: offer.sdp }),
      secondaryAnswer: null,
      primaryIce: [],
      secondaryIce: [],
      seq: 1,
    });

    let lastIcePushCount = 0;

    const pollId = setInterval(async () => {
      const newIce = pendingPrimaryIceRef.current.slice(lastIcePushCount);
      if (newIce.length > 0) {
        lastIcePushCount = pendingPrimaryIceRef.current.length;
        const current = await readSignaling(roomCode);
        if (current) {
          await mergeWrite(roomCode, {
            ...current,
            primaryIce: [...current.primaryIce, ...newIce],
          });
        }
      }

      const state = await readSignaling(roomCode);
      if (!state) return;

      if (state.secondaryAnswer && !pc.remoteDescription) {
        setConnState("connecting");
        try {
          await pc.setRemoteDescription(JSON.parse(state.secondaryAnswer));
        } catch {}
      }

      if (state.secondaryIce.length > addedSecondaryIceRef.current) {
        for (
          let i = addedSecondaryIceRef.current;
          i < state.secondaryIce.length;
          i++
        ) {
          try {
            await pc.addIceCandidate(JSON.parse(state.secondaryIce[i]));
          } catch {}
        }
        addedSecondaryIceRef.current = state.secondaryIce.length;
      }
    }, 600);

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        clearInterval(pollId);
        setConnState("connected");
        setPhase("camera");
      } else if (
        pc.connectionState === "failed" ||
        pc.connectionState === "closed"
      ) {
        clearInterval(pollId);
        setConnState("failed");
      }
    };
  };

  const copyCode = () => {
    navigator.clipboard.writeText(roomCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const shareLink = () => {
    const url = `${window.location.origin}${window.location.pathname}#join=${roomCode}`;
    if (navigator.share) {
      navigator.share({ title: "Join CamBridge", url });
    } else {
      navigator.clipboard.writeText(url);
      toast.success("Link copied!");
    }
  };

  if (phase === "gallery") {
    return (
      <GalleryView
        photos={capturedPhotos}
        videos={capturedVideos}
        onBack={() => setPhase("camera")}
      />
    );
  }

  if (phase === "setup") {
    return (
      <SetupView
        roomCode={roomCode}
        connState={connState}
        copied={copied}
        onCopy={copyCode}
        onShare={shareLink}
        onBack={onBack}
        onGoToCamera={() => setPhase("camera")}
      />
    );
  }

  return (
    <div
      className="fixed inset-0 bg-black overflow-hidden"
      data-ocid="primary.camera.canvas_target"
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover"
        style={{
          transform: `scale(${digitalZoom})${settings.facingMode === "user" ? " scaleX(-1)" : ""}`,
          transformOrigin: "center",
        }}
      >
        <track kind="captions" />
      </video>

      {settings.gridOverlay && (
        <div className="absolute inset-0 grid-overlay pointer-events-none" />
      )}

      <AnimatePresence>
        {timerCount > 0 && (
          <motion.div
            key={timerCount}
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            initial={{ scale: 1.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.5, opacity: 0 }}
          >
            <span
              className="text-9xl font-bold"
              style={{
                fontFamily: "'Bricolage Grotesque', sans-serif",
                color: "oklch(var(--primary))",
                textShadow: "0 0 40px oklch(0.76 0.18 65 / 0.6)",
              }}
            >
              {timerCount}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <div
        className="absolute top-20 left-8 w-8 h-8 border-l-2 border-t-2"
        style={{ borderColor: "oklch(var(--primary) / 0.7)" }}
      />
      <div
        className="absolute top-20 right-8 w-8 h-8 border-r-2 border-t-2"
        style={{ borderColor: "oklch(var(--primary) / 0.7)" }}
      />
      <div
        className="absolute bottom-32 left-8 w-8 h-8 border-l-2 border-b-2"
        style={{ borderColor: "oklch(var(--primary) / 0.7)" }}
      />
      <div
        className="absolute bottom-32 right-8 w-8 h-8 border-r-2 border-b-2"
        style={{ borderColor: "oklch(var(--primary) / 0.7)" }}
      />

      <div
        className="absolute top-0 left-0 right-0 px-4 pt-12 pb-4 flex items-center justify-between"
        style={{
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.7), transparent)",
        }}
      >
        <button
          type="button"
          onClick={onBack}
          className="cam-btn w-10 h-10"
          style={{ background: "rgba(0,0,0,0.4)" }}
        >
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>

        <div className="flex items-center gap-2">
          {isRecording && (
            <div
              className="flex items-center gap-1.5 px-2 py-1 rounded-full"
              style={{ background: "oklch(0.58 0.24 22 / 0.9)" }}
            >
              <span className="w-2 h-2 rounded-full bg-white recording-dot" />
              <span className="text-white text-xs font-mono font-bold">
                {formatTime(recDuration)}
              </span>
            </div>
          )}
          <div
            className="flex items-center gap-1.5 px-2 py-1 rounded-full"
            style={{
              background:
                connState === "connected"
                  ? "oklch(0.58 0.24 22 / 0.9)"
                  : "rgba(0,0,0,0.5)",
            }}
          >
            {connState === "connected" && (
              <span className="flex items-center gap-1.5">
                <span
                  className="w-2 h-2 rounded-full recording-dot"
                  style={{ background: "oklch(var(--primary))" }}
                />
                <span className="text-white text-xs font-bold">LIVE</span>
              </span>
            )}
            {connState === "connecting" && (
              <span className="flex items-center gap-1.5">
                <Wifi className="w-3 h-3 text-white" />
                <span className="text-white text-xs">Connecting...</span>
              </span>
            )}
            {connState === "failed" && (
              <span className="flex items-center gap-1.5">
                <WifiOff className="w-3 h-3 text-white" />
                <span className="text-white text-xs">Disconnected</span>
              </span>
            )}
            {connState === "waiting" && (
              <span className="flex items-center gap-1.5">
                <Wifi
                  className="w-3 h-3"
                  style={{ color: "oklch(var(--muted-foreground))" }}
                />
                <span
                  className="text-xs"
                  style={{ color: "oklch(var(--muted-foreground))" }}
                >
                  Waiting...
                </span>
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setPhase("gallery")}
          className="cam-btn w-10 h-10 relative"
          style={{ background: "rgba(0,0,0,0.4)" }}
        >
          <ImageIcon className="w-5 h-5 text-white" />
          {capturedPhotos.length > 0 && (
            <span
              className="absolute -top-1 -right-1 w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center"
              style={{
                background: "oklch(var(--primary))",
                color: "oklch(var(--primary-foreground))",
              }}
            >
              {capturedPhotos.length}
            </span>
          )}
        </button>
      </div>

      <div
        className="absolute bottom-0 left-0 right-0 px-6 pb-10 pt-4 flex items-center justify-between"
        style={{
          background: "linear-gradient(to top, rgba(0,0,0,0.8), transparent)",
        }}
      >
        <div className="text-center">
          <p
            className="text-xs font-mono font-bold"
            style={{ color: "oklch(var(--primary))" }}
          >
            {roomCode}
          </p>
          <p
            className="text-xs"
            style={{ color: "oklch(var(--muted-foreground))" }}
          >
            Room Code
          </p>
        </div>

        <button
          type="button"
          onClick={() => capturePhoto()}
          className="cam-btn w-16 h-16 border-4"
          style={{
            borderColor: "oklch(var(--primary))",
            background: "rgba(0,0,0,0.3)",
          }}
        >
          <Circle
            className="w-8 h-8"
            style={{ color: "oklch(var(--primary))" }}
          />
        </button>

        <button
          type="button"
          onClick={isRecording ? stopRecording : startRecording}
          className="cam-btn w-12 h-12"
          style={{
            background: isRecording
              ? "oklch(0.58 0.24 22)"
              : "rgba(255,255,255,0.15)",
          }}
        >
          {isRecording ? (
            <Square className="w-5 h-5 text-white" fill="white" />
          ) : (
            <Circle
              className="w-5 h-5"
              style={{ color: "oklch(0.58 0.24 22)" }}
              fill="oklch(0.58 0.24 22)"
            />
          )}
        </button>
      </div>

      {settings.flash && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2">
          <Zap className="w-5 h-5" style={{ color: "oklch(var(--primary))" }} />
        </div>
      )}
    </div>
  );
}

function SetupView({
  roomCode,
  connState,
  copied,
  onCopy,
  onShare,
  onBack,
  onGoToCamera,
}: {
  roomCode: string;
  connState: string;
  copied: boolean;
  onCopy: () => void;
  onShare: () => void;
  onBack: () => void;
  onGoToCamera: () => void;
}) {
  return (
    <div
      className="min-h-screen flex flex-col"
      data-ocid="primary.room_code.panel"
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 100% 60% at 50% 0%, oklch(0.76 0.18 65 / 0.06), transparent)",
        }}
      />

      <header className="px-4 pt-12 pb-2 flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="cam-btn w-10 h-10 border"
          style={{ borderColor: "oklch(var(--border))" }}
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1
            className="font-bold text-lg"
            style={{ fontFamily: "'Bricolage Grotesque', sans-serif" }}
          >
            Primary Camera
          </h1>
          <p
            className="text-xs"
            style={{ color: "oklch(var(--muted-foreground))" }}
          >
            Share the code below
          </p>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 gap-8 -mt-8">
        <motion.div
          className="w-full max-w-sm"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
        >
          <div
            className="rounded-2xl p-6 border text-center relative overflow-hidden"
            style={{
              background: "oklch(var(--card))",
              borderColor: "oklch(var(--border))",
            }}
          >
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  "radial-gradient(ellipse 80% 50% at 50% -20%, oklch(0.76 0.18 65 / 0.1), transparent)",
              }}
            />

            <p
              className="text-xs font-semibold tracking-widest uppercase mb-4 relative"
              style={{ color: "oklch(var(--muted-foreground))" }}
            >
              Room Code
            </p>

            <p
              className="text-5xl font-bold tracking-[0.25em] font-mono mb-4 relative"
              style={{
                fontFamily: "'Bricolage Grotesque', sans-serif",
                color: "oklch(var(--primary))",
                textShadow: "0 0 30px oklch(0.76 0.18 65 / 0.4)",
              }}
            >
              {roomCode}
            </p>

            <div className="flex gap-3 justify-center mb-5 relative">
              <button
                type="button"
                onClick={onCopy}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all active:scale-95"
                style={{
                  background: "oklch(var(--primary))",
                  color: "oklch(var(--primary-foreground))",
                }}
              >
                {copied ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
                {copied ? "Copied" : "Copy"}
              </button>
              <button
                type="button"
                onClick={onShare}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-all active:scale-95"
                style={{ borderColor: "oklch(var(--border))" }}
              >
                Share Link
              </button>
            </div>

            <div
              className="flex items-center gap-2 justify-center px-3 py-2 rounded-lg relative"
              style={{ background: "oklch(var(--muted) / 0.5)" }}
            >
              {connState === "waiting" && (
                <span className="flex items-center gap-2">
                  <span className="flex gap-1">
                    {PULSE_DOTS.map((i) => (
                      <motion.span
                        key={i}
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ background: "oklch(var(--primary))" }}
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{
                          duration: 1.2,
                          delay: i * 0.2,
                          repeat: Number.POSITIVE_INFINITY,
                        }}
                      />
                    ))}
                  </span>
                  <span
                    className="text-sm"
                    style={{ color: "oklch(var(--muted-foreground))" }}
                  >
                    Waiting for secondary phone...
                  </span>
                </span>
              )}
              {connState === "connecting" && (
                <span className="flex items-center gap-2">
                  <Wifi
                    className="w-4 h-4"
                    style={{ color: "oklch(var(--primary))" }}
                  />
                  <span
                    className="text-sm"
                    style={{ color: "oklch(var(--primary))" }}
                  >
                    Connecting...
                  </span>
                </span>
              )}
              {connState === "connected" && (
                <span className="flex items-center gap-2">
                  <Wifi
                    className="w-4 h-4"
                    style={{ color: "oklch(0.72 0.18 148)" }}
                  />
                  <span
                    className="text-sm"
                    style={{ color: "oklch(0.72 0.18 148)" }}
                  >
                    Secondary connected!
                  </span>
                </span>
              )}
              {connState === "failed" && (
                <span className="flex items-center gap-2">
                  <WifiOff
                    className="w-4 h-4"
                    style={{ color: "oklch(0.58 0.24 22)" }}
                  />
                  <span
                    className="text-sm"
                    style={{ color: "oklch(0.58 0.24 22)" }}
                  >
                    Connection failed
                  </span>
                </span>
              )}
            </div>
          </div>
        </motion.div>

        <motion.button
          type="button"
          onClick={onGoToCamera}
          className="px-8 py-4 rounded-2xl font-bold text-base transition-all active:scale-95"
          style={{
            background: "oklch(var(--card))",
            border: "1px solid oklch(var(--border))",
          }}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          Open Camera View →
        </motion.button>
      </main>
    </div>
  );
}

function GalleryView({
  photos,
  videos,
  onBack,
}: {
  photos: string[];
  videos: string[];
  onBack: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"photos" | "videos">("photos");
  const [lightbox, setLightbox] = useState<string | null>(null);

  return (
    <div className="min-h-screen flex flex-col">
      <header
        className="px-4 pt-12 pb-4 flex items-center gap-3 border-b"
        style={{ borderColor: "oklch(var(--border))" }}
      >
        <button
          type="button"
          onClick={onBack}
          className="cam-btn w-10 h-10 border"
          style={{ borderColor: "oklch(var(--border))" }}
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1
          className="font-bold text-lg"
          style={{ fontFamily: "'Bricolage Grotesque', sans-serif" }}
        >
          Gallery
        </h1>

        <div className="ml-auto flex gap-2">
          {(["photos", "videos"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              data-ocid={`primary.${tab}.tab`}
              className="px-3 py-1.5 rounded-lg text-sm font-semibold transition-all"
              style={{
                background:
                  activeTab === tab ? "oklch(var(--primary))" : "transparent",
                color:
                  activeTab === tab
                    ? "oklch(var(--primary-foreground))"
                    : "oklch(var(--muted-foreground))",
              }}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)} (
              {tab === "photos" ? photos.length : videos.length})
            </button>
          ))}
        </div>
      </header>

      <main className="flex-1 p-4">
        {activeTab === "photos" && (
          <div>
            {photos.length === 0 ? (
              <div
                className="flex flex-col items-center justify-center h-64 gap-3"
                data-ocid="gallery.empty_state"
              >
                <ImageIcon
                  className="w-12 h-12"
                  style={{ color: "oklch(var(--muted-foreground))" }}
                />
                <p style={{ color: "oklch(var(--muted-foreground))" }}>
                  No photos yet
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-1">
                {photos.map((url, i) => (
                  <button
                    key={url.slice(-20)}
                    type="button"
                    onClick={() => setLightbox(url)}
                    data-ocid={`gallery.item.${i + 1}`}
                    className="aspect-square"
                  >
                    <img
                      src={url}
                      alt={`Snapshot ${i + 1}`}
                      className="w-full h-full object-cover rounded-lg"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {activeTab === "videos" && (
          <div>
            {videos.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 gap-3">
                <Circle
                  className="w-12 h-12"
                  style={{ color: "oklch(var(--muted-foreground))" }}
                />
                <p style={{ color: "oklch(var(--muted-foreground))" }}>
                  No videos yet
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {videos.map((url, i) => (
                  <div key={url} data-ocid={`gallery.video.item.${i + 1}`}>
                    <video
                      src={url}
                      controls
                      className="w-full rounded-xl"
                      style={{ background: "oklch(var(--card))" }}
                    >
                      <track kind="captions" />
                    </video>
                    <a
                      href={url}
                      download={`video_${i + 1}.webm`}
                      className="text-xs mt-1 inline-block"
                      style={{ color: "oklch(var(--primary))" }}
                    >
                      Download
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      <AnimatePresence>
        {lightbox && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: "rgba(0,0,0,0.95)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLightbox(null)}
          >
            <button
              type="button"
              className="absolute top-12 right-4 cam-btn w-10 h-10"
              style={{ background: "rgba(255,255,255,0.1)" }}
              onClick={() => setLightbox(null)}
            >
              <X className="w-5 h-5 text-white" />
            </button>
            <img
              src={lightbox}
              alt="Lightbox view"
              className="max-w-full max-h-full object-contain"
            />
            <a
              href={lightbox}
              download="photo.jpg"
              className="absolute bottom-12 px-6 py-3 rounded-2xl font-semibold"
              style={{
                background: "oklch(var(--primary))",
                color: "oklch(var(--primary-foreground))",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              Download
            </a>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
