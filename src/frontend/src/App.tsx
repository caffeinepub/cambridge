import { Toaster } from "@/components/ui/sonner";
import { useState } from "react";
import PrimaryFlow from "./pages/PrimaryFlow";
import RoleSelection from "./pages/RoleSelection";
import SecondaryFlow from "./pages/SecondaryFlow";
import type { AppScreen } from "./types";

export default function App() {
  const [screen, setScreen] = useState<AppScreen>("role-select");

  return (
    <div className="min-h-screen bg-background text-foreground overflow-hidden">
      {screen === "role-select" && (
        <RoleSelection
          onSelectPrimary={() => setScreen("primary")}
          onSelectSecondary={() => setScreen("secondary")}
        />
      )}
      {screen === "primary" && (
        <PrimaryFlow onBack={() => setScreen("role-select")} />
      )}
      {screen === "secondary" && (
        <SecondaryFlow onBack={() => setScreen("role-select")} />
      )}
      <Toaster theme="dark" position="top-center" />
    </div>
  );
}
