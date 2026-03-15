import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  ArrowLeft,
  Camera,
  Clock,
  Grid,
  Loader2,
  RotateCcw,
  Video,
  VideoOff,
  Wifi,
  WifiOff,
  Zap,
  ZapOff,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useActor } from "../hooks/useActor";
import { useSignaling } from "../hooks/useSignaling";
import type { CameraCommand, CameraSettings, PrimaryStatus } from "../types";
import { DEFAULT_SETTINGS } from "../types";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
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

export default function SecondaryFlow({ onBack }: Props) {
  const [phase, setPhase] = useState<"join" | "connecting" | "monitor">("join");
  const [roomCode, setRoomCode] = useState("");
  const [connState, setConnState] = useState<
    "idle" | "connecting" | "connected" | "failed"
  >("idle");
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [primaryStatus, setPrimaryStatus] = useState<PrimaryStatus | null>(
    null,
  );
  const [localSettings, setLocalSettings] =
    useState<CameraSettings>(DEFAULT_SETTINGS);
  const [isRemoteRecording, setIsRemoteRecording] = useState(false);
  const [remoteRecDuration, setRemoteRecDuration] = useState(0);
  const [supported, setSupported] = useState({
    torch: false,
    zoom: false,
    zoomMin: 1,
    zoomMax: 8,
  });

  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const addedPrimaryIceRef = useRef(0);
  const pendingSecondaryIceRef = useRef<string[]>([]);
  const isMountedRef = useRef(true);

  const { readSignaling, mergeWrite } = useSignaling();
  const { actor, isFetching } = useActor();

  useEffect(() => {
    const hash = window.location.hash;
    const match = hash.match(/#join=([A-Z0-9]{6})/);
    if (match) setRoomCode(match[1]);
    return () => {
      isMountedRef.current = false;
      if (pcRef.current) pcRef.current.close();
    };
  }, []);

  // Capture primaryStatus for capturedCount
  const capturedCount = primaryStatus?.capturedCount ?? 0;

  const sendCommand = useCallback((cmd: CameraCommand) => {
    if (dcRef.current?.readyState === "open") {
      dcRef.current.send(JSON.stringify(cmd));
      if (cmd.type === "setZoom")
        setLocalSettings((s) => ({ ...s, zoom: cmd.value }));
      else if (cmd.type === "setFlash")
        setLocalSettings((s) => ({ ...s, flash: cmd.enabled }));
      else if (cmd.type === "setTimer")
        setLocalSettings((s) => ({ ...s, timer: cmd.value }));
      else if (cmd.type === "setResolution")
        setLocalSettings((s) => ({ ...s, resolution: cmd.value }));
      else if (cmd.type === "setExposure")
        setLocalSettings((s) => ({ ...s, exposure: cmd.value }));
      else if (cmd.type === "setWhiteBalance")
        setLocalSettings((s) => ({
          ...s,
          whiteBalance: cmd.value as CameraSettings["whiteBalance"],
        }));
      else if (cmd.type === "setGrid")
        setLocalSettings((s) => ({ ...s, gridOverlay: cmd.enabled }));
      else if (cmd.type === "setFocusMode")
        setLocalSettings((s) => ({
          ...s,
          focusMode: cmd.value as CameraSettings["focusMode"],
        }));
    } else {
      toast.error("Not connected to primary");
    }
  }, []);

  const joinRoom = async (code: string) => {
    if (!actor || isFetching) {
      toast.error("Still loading, please wait...");
      return;
    }
    if (code.length !== 6) {
      toast.error("Enter a 6-character room code");
      return;
    }

    setConnState("connecting");
    setPhase("connecting");

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ],
    });
    pcRef.current = pc;

    pc.ontrack = (e) => {
      if (e.streams[0]) {
        setRemoteStream(e.streams[0]);
        if (videoRef.current) videoRef.current.srcObject = e.streams[0];
      }
    };

    pc.ondatachannel = (e) => {
      const dc = e.channel;
      dcRef.current = dc;
      dc.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === "status") {
            const status = msg as PrimaryStatus;
            setPrimaryStatus(status);
            setLocalSettings(status.settings);
            setIsRemoteRecording(status.isRecording);
            setRemoteRecDuration(status.recordingDuration);
            setSupported(status.supported);
          }
        } catch {}
      };
      dc.onopen = () => {
        setConnState("connected");
        setPhase("monitor");
      };
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        setConnState("connected");
        setPhase("monitor");
      } else if (
        pc.connectionState === "failed" ||
        pc.connectionState === "closed"
      ) {
        if (isMountedRef.current) setConnState("failed");
      }
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        pendingSecondaryIceRef.current.push(
          JSON.stringify(e.candidate.toJSON()),
        );
      }
    };

    let attempts = 0;
    let state = await readSignaling(code);
    while ((!state || !state.primaryOffer) && attempts < 60) {
      await sleep(600);
      state = await readSignaling(code);
      attempts++;
    }

    if (!state?.primaryOffer) {
      toast.error("Room not found. Check the code and try again.");
      setConnState("failed");
      setPhase("join");
      pc.close();
      return;
    }

    try {
      await pc.setRemoteDescription(JSON.parse(state.primaryOffer));
    } catch {
      toast.error("Failed to connect");
      setConnState("failed");
      setPhase("join");
      pc.close();
      return;
    }

    for (let i = 0; i < state.primaryIce.length; i++) {
      try {
        await pc.addIceCandidate(JSON.parse(state.primaryIce[i]));
      } catch {}
    }
    addedPrimaryIceRef.current = state.primaryIce.length;

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    await mergeWrite(code, {
      secondaryAnswer: JSON.stringify({ type: answer.type, sdp: answer.sdp }),
      phase: "answered",
    });

    let lastIcePushCount = 0;

    const pollId = setInterval(async () => {
      if (!isMountedRef.current) {
        clearInterval(pollId);
        return;
      }

      const newIce = pendingSecondaryIceRef.current.slice(lastIcePushCount);
      if (newIce.length > 0) {
        lastIcePushCount = pendingSecondaryIceRef.current.length;
        const cur = await readSignaling(code);
        if (cur)
          await mergeWrite(code, {
            secondaryIce: [...cur.secondaryIce, ...newIce],
          });
      }

      const cur = await readSignaling(code);
      if (cur && cur.primaryIce.length > addedPrimaryIceRef.current) {
        for (
          let i = addedPrimaryIceRef.current;
          i < cur.primaryIce.length;
          i++
        ) {
          try {
            await pc.addIceCandidate(JSON.parse(cur.primaryIce[i]));
          } catch {}
        }
        addedPrimaryIceRef.current = cur.primaryIce.length;
      }
    }, 600);

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        clearInterval(pollId);
        setConnState("connected");
        setPhase("monitor");
      } else if (
        pc.connectionState === "failed" ||
        pc.connectionState === "closed"
      ) {
        clearInterval(pollId);
        if (isMountedRef.current) setConnState("failed");
      }
    };
  };

  if (phase === "join") {
    return (
      <JoinView
        roomCode={roomCode}
        setRoomCode={setRoomCode}
        onJoin={() => joinRoom(roomCode.toUpperCase())}
        onBack={onBack}
        isLoading={isFetching}
      />
    );
  }

  if (phase === "connecting") {
    return (
      <ConnectingView
        roomCode={roomCode}
        connState={connState}
        onBack={() => {
          pcRef.current?.close();
          setPhase("join");
          setConnState("idle");
        }}
      />
    );
  }

  return (
    <MonitorView
      videoRef={videoRef}
      remoteStream={remoteStream}
      connState={connState}
      settings={localSettings}
      isRecording={isRemoteRecording}
      recordingDuration={remoteRecDuration}
      supported={supported}
      capturedCount={capturedCount}
      onCommand={sendCommand}
      onBack={() => {
        pcRef.current?.close();
        setPhase("join");
        setConnState("idle");
        setRemoteStream(null);
      }}
    />
  );
}

function JoinView({
  roomCode,
  setRoomCode,
  onJoin,
  onBack,
  isLoading,
}: {
  roomCode: string;
  setRoomCode: (v: string) => void;
  onJoin: () => void;
  onBack: () => void;
  isLoading: boolean;
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -10%, oklch(0.65 0.18 210 / 0.07), transparent)",
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
            Join as Monitor
          </h1>
          <p
            className="text-xs"
            style={{ color: "oklch(var(--muted-foreground))" }}
          >
            Enter the room code from the primary phone
          </p>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 gap-6">
        <motion.div
          className="w-full max-w-sm"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div
            className="rounded-2xl p-6 border"
            style={{
              background: "oklch(var(--card))",
              borderColor: "oklch(var(--border))",
            }}
          >
            <p
              className="text-xs font-semibold tracking-widest uppercase mb-4"
              style={{ color: "oklch(var(--muted-foreground))" }}
            >
              Room Code
            </p>

            <input
              data-ocid="secondary.join.input"
              type="text"
              value={roomCode}
              onChange={(e) =>
                setRoomCode(e.target.value.toUpperCase().slice(0, 6))
              }
              onKeyDown={(e) => e.key === "Enter" && onJoin()}
              placeholder="ABC123"
              maxLength={6}
              className="w-full text-center text-4xl font-mono font-bold tracking-[0.3em] rounded-xl py-4 mb-5 outline-none border-2 bg-transparent transition-colors"
              style={{
                fontFamily: "'Bricolage Grotesque', sans-serif",
                color: "oklch(var(--primary))",
                borderColor:
                  roomCode.length === 6
                    ? "oklch(var(--primary))"
                    : "oklch(var(--border))",
                caretColor: "oklch(var(--primary))",
              }}
              autoComplete="off"
              autoCapitalize="characters"
            />

            <button
              type="button"
              data-ocid="secondary.join.submit_button"
              onClick={onJoin}
              disabled={isLoading || roomCode.length !== 6}
              className="w-full py-4 rounded-xl font-bold text-base transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
              style={{
                background: "oklch(var(--primary))",
                color: "oklch(var(--primary-foreground))",
              }}
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" /> Loading...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Wifi className="w-5 h-5" /> Connect to Camera
                </span>
              )}
            </button>
          </div>
        </motion.div>

        <motion.p
          className="text-xs text-center px-4"
          style={{ color: "oklch(var(--muted-foreground))" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          Both phones must be connected to the same network or hotspot for best
          performance.
        </motion.p>
      </main>
    </div>
  );
}

function ConnectingView({
  roomCode,
  connState,
  onBack,
}: {
  roomCode: string;
  connState: string;
  onBack: () => void;
}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <motion.div
        className="text-center"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
      >
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
          style={{ background: "oklch(0.76 0.18 65 / 0.1)" }}
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{
              duration: 2,
              repeat: Number.POSITIVE_INFINITY,
              ease: "linear",
            }}
          >
            <Loader2
              className="w-10 h-10"
              style={{ color: "oklch(var(--primary))" }}
            />
          </motion.div>
        </div>

        <h2
          className="text-2xl font-bold mb-2"
          style={{ fontFamily: "'Bricolage Grotesque', sans-serif" }}
        >
          Connecting...
        </h2>
        <p
          className="text-sm mb-1"
          style={{ color: "oklch(var(--muted-foreground))" }}
        >
          Joining room{" "}
          <span
            className="font-mono font-bold"
            style={{ color: "oklch(var(--primary))" }}
          >
            {roomCode}
          </span>
        </p>
        {connState === "failed" && (
          <p className="text-sm mt-3" style={{ color: "oklch(0.58 0.24 22)" }}>
            Connection failed. Please check the room code.
          </p>
        )}

        <button
          type="button"
          onClick={onBack}
          className="mt-8 px-6 py-3 rounded-xl border font-semibold text-sm transition-all active:scale-95"
          style={{ borderColor: "oklch(var(--border))" }}
        >
          Cancel
        </button>
      </motion.div>
    </div>
  );
}

function MonitorView({
  videoRef,
  remoteStream: _remoteStream,
  connState,
  settings,
  isRecording,
  recordingDuration,
  supported,
  capturedCount,
  onCommand,
  onBack,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  remoteStream: MediaStream | null;
  connState: string;
  settings: CameraSettings;
  isRecording: boolean;
  recordingDuration: number;
  supported: {
    torch: boolean;
    zoom: boolean;
    zoomMin: number;
    zoomMax: number;
  };
  capturedCount: number;
  onCommand: (cmd: CameraCommand) => void;
  onBack: () => void;
}) {
  const [captureAnim, setCaptureAnim] = useState(false);

  const triggerCapture = () => {
    onCommand({ type: "capture", timer: settings.timer });
    setCaptureAnim(true);
    setTimeout(() => setCaptureAnim(false), 300);
  };

  return (
    <div className="fixed inset-0 flex flex-col bg-black overflow-hidden">
      {/* Video area */}
      <div
        data-ocid="secondary.stream.canvas_target"
        className="relative flex-shrink-0"
        style={{ height: "58%" }}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className="w-full h-full object-cover"
        >
          <track kind="captions" />
        </video>

        {connState !== "connected" && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center"
            style={{ background: "rgba(0,0,0,0.85)" }}
          >
            <Loader2
              className="w-10 h-10 animate-spin mb-3"
              style={{ color: "oklch(var(--primary))" }}
            />
            <p
              className="text-sm"
              style={{ color: "oklch(var(--muted-foreground))" }}
            >
              Waiting for video...
            </p>
          </div>
        )}

        <AnimatePresence>
          {captureAnim && (
            <motion.div
              className="absolute inset-0 bg-white pointer-events-none"
              initial={{ opacity: 0.7 }}
              animate={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            />
          )}
        </AnimatePresence>

        {/* Corners */}
        <div
          className="absolute top-4 left-4 w-6 h-6 border-l-2 border-t-2"
          style={{ borderColor: "oklch(var(--primary) / 0.8)" }}
        />
        <div
          className="absolute top-4 right-4 w-6 h-6 border-r-2 border-t-2"
          style={{ borderColor: "oklch(var(--primary) / 0.8)" }}
        />
        <div
          className="absolute bottom-4 left-4 w-6 h-6 border-l-2 border-b-2"
          style={{ borderColor: "oklch(var(--primary) / 0.8)" }}
        />
        <div
          className="absolute bottom-4 right-4 w-6 h-6 border-r-2 border-b-2"
          style={{ borderColor: "oklch(var(--primary) / 0.8)" }}
        />

        {/* Top HUD */}
        <div
          className="absolute top-0 left-0 right-0 px-3 pt-10 pb-2 flex items-center justify-between"
          style={{
            background:
              "linear-gradient(to bottom, rgba(0,0,0,0.6), transparent)",
          }}
        >
          <button
            type="button"
            onClick={onBack}
            className="cam-btn w-9 h-9"
            style={{ background: "rgba(0,0,0,0.5)" }}
          >
            <ArrowLeft className="w-4 h-4 text-white" />
          </button>

          <div className="flex items-center gap-2">
            {isRecording && (
              <div
                className="flex items-center gap-1 px-2 py-0.5 rounded-full"
                style={{ background: "oklch(0.58 0.24 22 / 0.9)" }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-white recording-dot" />
                <span className="text-white text-xs font-mono">
                  {formatTime(recordingDuration)}
                </span>
              </div>
            )}
            <div
              className="flex items-center gap-1 px-2 py-0.5 rounded-full"
              style={{
                background:
                  connState === "connected"
                    ? "oklch(0.58 0.24 22 / 0.9)"
                    : "rgba(0,0,0,0.5)",
              }}
            >
              {connState === "connected" ? (
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-white recording-dot" />
                  <span className="text-white text-xs font-bold">LIVE</span>
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <WifiOff className="w-3 h-3 text-white" />
                  <span className="text-white text-xs">No signal</span>
                </span>
              )}
            </div>
          </div>

          <div
            className="text-xs font-mono"
            style={{ color: "rgba(255,255,255,0.7)" }}
          >
            {capturedCount > 0 && `📷 ${capturedCount}`}
          </div>
        </div>
      </div>

      {/* Control panel */}
      <div
        className="flex-1 overflow-y-auto overscroll-contain"
        style={{ background: "oklch(0.07 0.008 265)", minHeight: 0 }}
      >
        <div className="px-4 py-3 space-y-4">
          {/* Row 1: Main buttons */}
          <div className="flex items-center justify-between gap-3">
            {/* Capture */}
            <div className="flex flex-col items-center gap-1">
              <button
                type="button"
                data-ocid="secondary.capture.primary_button"
                onClick={triggerCapture}
                className="cam-btn w-16 h-16 border-4 active:bg-white/20"
                style={{
                  borderColor: "oklch(var(--primary))",
                  background: "oklch(var(--primary) / 0.1)",
                }}
              >
                <Camera
                  className="w-7 h-7"
                  style={{ color: "oklch(var(--primary))" }}
                />
              </button>
              <span
                className="text-xs"
                style={{ color: "oklch(var(--muted-foreground))" }}
              >
                Capture
              </span>
            </div>

            {/* Record */}
            <div className="flex flex-col items-center gap-1">
              <button
                type="button"
                data-ocid="secondary.record.toggle"
                onClick={() => onCommand({ type: "toggleRecord" })}
                className="cam-btn w-16 h-16 transition-all"
                style={{
                  background: isRecording
                    ? "oklch(0.58 0.24 22)"
                    : "oklch(var(--muted))",
                  border: `2px solid ${isRecording ? "oklch(0.58 0.24 22)" : "oklch(var(--border))"}`,
                }}
              >
                {isRecording ? (
                  <VideoOff className="w-7 h-7 text-white" />
                ) : (
                  <Video
                    className="w-7 h-7"
                    style={{ color: "oklch(var(--foreground))" }}
                  />
                )}
              </button>
              <span
                className="text-xs"
                style={{ color: "oklch(var(--muted-foreground))" }}
              >
                {isRecording ? "Stop" : "Record"}
              </span>
            </div>

            {/* Flip */}
            <div className="flex flex-col items-center gap-1">
              <button
                type="button"
                data-ocid="secondary.flip.secondary_button"
                onClick={() => onCommand({ type: "switchCamera" })}
                className="cam-btn w-16 h-16 border"
                style={{
                  background: "oklch(var(--muted))",
                  borderColor: "oklch(var(--border))",
                }}
              >
                <RotateCcw
                  className="w-7 h-7"
                  style={{ color: "oklch(var(--foreground))" }}
                />
              </button>
              <span
                className="text-xs"
                style={{ color: "oklch(var(--muted-foreground))" }}
              >
                Flip
              </span>
            </div>

            {/* Flash */}
            <div className="flex flex-col items-center gap-1">
              <button
                type="button"
                data-ocid="secondary.flash.toggle"
                onClick={() =>
                  onCommand({ type: "setFlash", enabled: !settings.flash })
                }
                className="cam-btn w-16 h-16 border transition-all"
                style={{
                  background: settings.flash
                    ? "oklch(0.76 0.18 65 / 0.2)"
                    : "oklch(var(--muted))",
                  borderColor: settings.flash
                    ? "oklch(var(--primary))"
                    : "oklch(var(--border))",
                }}
              >
                {settings.flash ? (
                  <Zap
                    className="w-7 h-7"
                    style={{ color: "oklch(var(--primary))" }}
                  />
                ) : (
                  <ZapOff
                    className="w-7 h-7"
                    style={{ color: "oklch(var(--muted-foreground))" }}
                  />
                )}
              </button>
              <span
                className="text-xs"
                style={{
                  color: settings.flash
                    ? "oklch(var(--primary))"
                    : "oklch(var(--muted-foreground))",
                }}
              >
                Flash {settings.flash ? "On" : "Off"}
              </span>
            </div>
          </div>

          <div
            className="h-px"
            style={{ background: "oklch(var(--border))" }}
          />

          {/* Zoom */}
          <div>
            <div className="flex justify-between mb-2">
              <span
                className="text-xs font-semibold"
                style={{ color: "oklch(var(--muted-foreground))" }}
              >
                ZOOM
              </span>
              <span
                className="text-xs font-mono font-bold"
                style={{ color: "oklch(var(--primary))" }}
              >
                {settings.zoom.toFixed(1)}×
              </span>
            </div>
            <Slider
              data-ocid="secondary.zoom.input"
              min={1}
              max={supported.zoom ? supported.zoomMax : 8}
              step={0.1}
              value={[settings.zoom]}
              onValueChange={([v]) => onCommand({ type: "setZoom", value: v })}
              className="w-full"
            />
            <div className="flex justify-between mt-1">
              <span
                className="text-xs"
                style={{ color: "oklch(var(--muted-foreground))" }}
              >
                1×
              </span>
              <span
                className="text-xs"
                style={{ color: "oklch(var(--muted-foreground))" }}
              >
                {supported.zoom ? `${supported.zoomMax}×` : "8×"}
              </span>
            </div>
          </div>

          {/* Exposure */}
          <div>
            <div className="flex justify-between mb-2">
              <span
                className="text-xs font-semibold"
                style={{ color: "oklch(var(--muted-foreground))" }}
              >
                EXPOSURE
              </span>
              <span
                className="text-xs font-mono font-bold"
                style={{
                  color:
                    settings.exposure !== 0
                      ? "oklch(var(--primary))"
                      : "oklch(var(--muted-foreground))",
                }}
              >
                {settings.exposure > 0 ? "+" : ""}
                {settings.exposure.toFixed(1)} EV
              </span>
            </div>
            <Slider
              min={-2}
              max={2}
              step={0.1}
              value={[settings.exposure]}
              onValueChange={([v]) =>
                onCommand({ type: "setExposure", value: v })
              }
              className="w-full"
            />
            <div className="flex justify-between mt-1">
              <span
                className="text-xs"
                style={{ color: "oklch(var(--muted-foreground))" }}
              >
                -2 EV
              </span>
              <span
                className="text-xs"
                style={{ color: "oklch(var(--muted-foreground))" }}
              >
                +2 EV
              </span>
            </div>
          </div>

          <div
            className="h-px"
            style={{ background: "oklch(var(--border))" }}
          />

          {/* Toggles row */}
          <div className="grid grid-cols-2 gap-3">
            <div
              className="flex items-center justify-between p-3 rounded-xl"
              style={{
                background: "oklch(var(--card))",
                border: "1px solid oklch(var(--border))",
              }}
            >
              <div className="flex items-center gap-2">
                <Grid
                  className="w-4 h-4"
                  style={{ color: "oklch(var(--muted-foreground))" }}
                />
                <span className="text-xs font-semibold">Grid</span>
              </div>
              <Switch
                checked={settings.gridOverlay}
                onCheckedChange={(v) =>
                  onCommand({ type: "setGrid", enabled: v })
                }
              />
            </div>

            <div
              className="flex items-center justify-between p-3 rounded-xl"
              style={{
                background: "oklch(var(--card))",
                border: "1px solid oklch(var(--border))",
              }}
            >
              <div className="flex items-center gap-2">
                <Clock
                  className="w-4 h-4"
                  style={{ color: "oklch(var(--muted-foreground))" }}
                />
                <span className="text-xs font-semibold">Timer</span>
              </div>
              <Select
                value={settings.timer.toString()}
                onValueChange={(v) =>
                  onCommand({ type: "setTimer", value: Number.parseInt(v) })
                }
              >
                <SelectTrigger
                  data-ocid="secondary.timer.select"
                  className="w-16 h-7 text-xs border-0 p-0"
                  style={{
                    background: "transparent",
                    color:
                      settings.timer > 0 ? "oklch(var(--primary))" : undefined,
                  }}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Off</SelectItem>
                  <SelectItem value="3">3s</SelectItem>
                  <SelectItem value="10">10s</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div
            className="h-px"
            style={{ background: "oklch(var(--border))" }}
          />

          {/* Settings selects */}
          <div className="grid grid-cols-2 gap-3">
            <div
              className="p-3 rounded-xl"
              style={{
                background: "oklch(var(--card))",
                border: "1px solid oklch(var(--border))",
              }}
            >
              <p
                className="text-xs font-semibold mb-2"
                style={{ color: "oklch(var(--muted-foreground))" }}
              >
                RESOLUTION
              </p>
              <Select
                value={settings.resolution}
                onValueChange={(v) =>
                  onCommand({
                    type: "setResolution",
                    value: v as CameraSettings["resolution"],
                  })
                }
              >
                <SelectTrigger
                  data-ocid="secondary.resolution.select"
                  className="w-full h-8 text-sm"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="720p">720p HD</SelectItem>
                  <SelectItem value="1080p">1080p FHD</SelectItem>
                  <SelectItem value="4K">4K UHD</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div
              className="p-3 rounded-xl"
              style={{
                background: "oklch(var(--card))",
                border: "1px solid oklch(var(--border))",
              }}
            >
              <p
                className="text-xs font-semibold mb-2"
                style={{ color: "oklch(var(--muted-foreground))" }}
              >
                WHITE BALANCE
              </p>
              <Select
                value={settings.whiteBalance}
                onValueChange={(v) =>
                  onCommand({ type: "setWhiteBalance", value: v })
                }
              >
                <SelectTrigger className="w-full h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto</SelectItem>
                  <SelectItem value="sunny">☀️ Sunny</SelectItem>
                  <SelectItem value="cloudy">☁️ Cloudy</SelectItem>
                  <SelectItem value="indoor">💡 Indoor</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div
              className="p-3 rounded-xl"
              style={{
                background: "oklch(var(--card))",
                border: "1px solid oklch(var(--border))",
              }}
            >
              <p
                className="text-xs font-semibold mb-2"
                style={{ color: "oklch(var(--muted-foreground))" }}
              >
                FOCUS
              </p>
              <Select
                value={settings.focusMode}
                onValueChange={(v) =>
                  onCommand({ type: "setFocusMode", value: v })
                }
              >
                <SelectTrigger className="w-full h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="h-4" />
          <p
            className="text-center text-xs pb-2"
            style={{ color: "oklch(var(--muted-foreground))" }}
          >
            © {new Date().getFullYear()}. Built with ❤️ using{" "}
            <a
              href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(window.location.hostname)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              caffeine.ai
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
