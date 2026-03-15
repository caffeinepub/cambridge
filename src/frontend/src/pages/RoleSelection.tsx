import { Camera, Monitor, Wifi, Zap } from "lucide-react";
import { motion } from "motion/react";

interface Props {
  onSelectPrimary: () => void;
  onSelectSecondary: () => void;
}

export default function RoleSelection({
  onSelectPrimary,
  onSelectSecondary,
}: Props) {
  return (
    <div className="min-h-screen flex flex-col bg-background relative overflow-hidden">
      {/* Background atmosphere */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -20%, oklch(0.76 0.18 65 / 0.08), transparent), radial-gradient(ellipse 60% 40% at 80% 80%, oklch(0.72 0.20 45 / 0.05), transparent)",
        }}
      />

      {/* Header */}
      <motion.header
        className="pt-safe-top px-6 pt-12 pb-4 flex flex-col items-center gap-2"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        <div className="flex items-center gap-2 mb-1">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: "oklch(var(--primary))" }}
          >
            <Camera
              className="w-5 h-5"
              style={{ color: "oklch(var(--primary-foreground))" }}
            />
          </div>
          <span
            className="text-2xl font-bold tracking-tight"
            style={{ fontFamily: "'Bricolage Grotesque', sans-serif" }}
          >
            CamBridge
          </span>
        </div>
        <p
          className="text-sm"
          style={{ color: "oklch(var(--muted-foreground))" }}
        >
          Professional remote camera control
        </p>
      </motion.header>

      {/* Main content */}
      <main className="flex-1 flex flex-col justify-center px-5 py-6 gap-4">
        <motion.p
          className="text-center text-xs font-semibold tracking-widest uppercase mb-2"
          style={{ color: "oklch(var(--muted-foreground))" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          Select your role
        </motion.p>

        {/* Primary Card */}
        <motion.button
          data-ocid="role.primary_button"
          onClick={onSelectPrimary}
          className="w-full text-left rounded-2xl p-5 border transition-all duration-200 active:scale-[0.98] group relative overflow-hidden"
          style={{
            background: "oklch(var(--card))",
            borderColor: "oklch(var(--border))",
          }}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          whileTap={{ scale: 0.98 }}
        >
          <div
            className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse 80% 60% at 20% 50%, oklch(0.76 0.18 65 / 0.07), transparent)",
            }}
          />
          <div className="flex items-start gap-4 relative">
            <div
              className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
              style={{ background: "oklch(0.76 0.18 65 / 0.15)" }}
            >
              <Camera
                className="w-7 h-7"
                style={{ color: "oklch(var(--primary))" }}
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <h2
                  className="text-xl font-bold"
                  style={{ fontFamily: "'Bricolage Grotesque', sans-serif" }}
                >
                  Primary Camera
                </h2>
                <span
                  className="text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{
                    background: "oklch(0.76 0.18 65 / 0.15)",
                    color: "oklch(var(--primary))",
                  }}
                >
                  HOST
                </span>
              </div>
              <p
                className="text-sm leading-relaxed"
                style={{ color: "oklch(var(--muted-foreground))" }}
              >
                Use your camera as the main lens. Share a room code for the
                secondary phone to connect and control it remotely.
              </p>
              <div className="flex gap-3 mt-3">
                {["Live Stream", "Record Video", "Capture Photos"].map(
                  (feat) => (
                    <span
                      key={feat}
                      className="text-xs px-2 py-0.5 rounded-full border"
                      style={{
                        borderColor: "oklch(var(--border))",
                        color: "oklch(var(--muted-foreground))",
                      }}
                    >
                      {feat}
                    </span>
                  ),
                )}
              </div>
            </div>
          </div>
        </motion.button>

        {/* Secondary Card */}
        <motion.button
          data-ocid="role.secondary_button"
          onClick={onSelectSecondary}
          className="w-full text-left rounded-2xl p-5 border transition-all duration-200 active:scale-[0.98] group relative overflow-hidden"
          style={{
            background: "oklch(var(--card))",
            borderColor: "oklch(var(--border))",
          }}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, duration: 0.5 }}
          whileTap={{ scale: 0.98 }}
        >
          <div
            className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse 80% 60% at 20% 50%, oklch(0.65 0.18 210 / 0.07), transparent)",
            }}
          />
          <div className="flex items-start gap-4 relative">
            <div
              className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
              style={{ background: "oklch(0.65 0.18 210 / 0.12)" }}
            >
              <Monitor
                className="w-7 h-7"
                style={{ color: "oklch(0.72 0.15 210)" }}
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <h2
                  className="text-xl font-bold"
                  style={{ fontFamily: "'Bricolage Grotesque', sans-serif" }}
                >
                  Secondary Monitor
                </h2>
                <span
                  className="text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{
                    background: "oklch(0.65 0.18 210 / 0.12)",
                    color: "oklch(0.72 0.15 210)",
                  }}
                >
                  REMOTE
                </span>
              </div>
              <p
                className="text-sm leading-relaxed"
                style={{ color: "oklch(var(--muted-foreground))" }}
              >
                See the primary camera's live feed and control all settings —
                zoom, flash, recording, and more.
              </p>
              <div className="flex gap-3 mt-3">
                {["Live View", "Full Control", "All Settings"].map((feat) => (
                  <span
                    key={feat}
                    className="text-xs px-2 py-0.5 rounded-full border"
                    style={{
                      borderColor: "oklch(var(--border))",
                      color: "oklch(var(--muted-foreground))",
                    }}
                  >
                    {feat}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </motion.button>

        {/* Info strip */}
        <motion.div
          className="flex items-center justify-center gap-6 pt-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.65 }}
        >
          <div
            className="flex items-center gap-1.5 text-xs"
            style={{ color: "oklch(var(--muted-foreground))" }}
          >
            <Wifi className="w-3.5 h-3.5" />
            <span>Works over hotspot</span>
          </div>
          <div
            className="flex items-center gap-1.5 text-xs"
            style={{ color: "oklch(var(--muted-foreground))" }}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>P2P via WebRTC</span>
          </div>
        </motion.div>
      </main>

      {/* Footer */}
      <footer
        className="pb-8 text-center text-xs"
        style={{ color: "oklch(var(--muted-foreground))" }}
      >
        © {new Date().getFullYear()}. Built with ❤️ using{" "}
        <a
          href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(window.location.hostname)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-foreground transition-colors"
        >
          caffeine.ai
        </a>
      </footer>
    </div>
  );
}
