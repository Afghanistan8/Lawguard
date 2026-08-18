import { useEffect, useMemo, useState } from "react";
import { Header } from "./components/Header";
import { Disclaimer } from "./components/Disclaimer";
import { ToolPanel } from "./components/ToolPanel";
import { AnalysesPanel } from "./components/AnalysesPanel";
import { AlertsPanel } from "./components/AlertsPanel";
import { CaseRegistryPanel } from "./components/CaseRegistryPanel";
import { TrustedSourcesPanel } from "./components/TrustedSourcesPanel";
import { StatsPanel } from "./components/StatsPanel";
import { useWallet } from "./useWallet";
import { useGenLayer } from "./useGenLayer";
import { TOOLS } from "./tools";
import { CONTRACT_ADDRESS } from "./config";
import type { SampleScenario } from "./types";

type Nav = "tools" | "ledger" | "alerts" | "cases" | "sources" | "dashboard";

const NAV_ITEMS: { key: Nav; label: string }[] = [
  { key: "tools", label: "Verification tools" },
  { key: "ledger", label: "Analyses ledger" },
  { key: "alerts", label: "Alerts" },
  { key: "cases", label: "Cases" },
  { key: "sources", label: "Trusted sources" },
  { key: "dashboard", label: "Dashboard" },
];

export default function App() {
  // ---- theme ----
  const [theme, setTheme] = useState<"light" | "dark">(
    () => (localStorage.getItem("lawguard.theme") as "light" | "dark") || "light"
  );
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("lawguard.theme", theme);
  }, [theme]);

  // ---- wallet + client ----
  const wallet = useWallet();
  const [contractAddress, setContractAddress] = useState<string>(CONTRACT_ADDRESS);
  const api = useGenLayer(contractAddress);

  // ---- navigation ----
  const [nav, setNav] = useState<Nav>("tools");
  const [activeTool, setActiveTool] = useState<string>(TOOLS[0].key);

  // ---- sample scenarios ----
  const [samples, setSamples] = useState<SampleScenario[]>([]);
  useEffect(() => {
    fetch("/sample_cases.json")
      .then((r) => r.json())
      .then((d) => setSamples(d.scenarios ?? []))
      .catch(() => setSamples([]));
  }, []);

  const currentTool = useMemo(
    () => TOOLS.find((t) => t.key === activeTool) ?? TOOLS[0],
    [activeTool]
  );

  return (
    <div className="app">
      <Header
        wallet={wallet}
        theme={theme}
        onToggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
      />

      <main className="container" style={{ flex: 1, paddingBottom: 24 }}>
        <div style={{ marginTop: 18 }}>
          <Disclaimer />
        </div>

        <ContractSetup
          value={contractAddress}
          onChange={setContractAddress}
          ready={api.ready}
          connected={wallet.connected}
        />

        {/* Primary navigation */}
        <div className="tabs" role="tablist">
          {NAV_ITEMS.map((n) => (
            <button
              key={n.key}
              role="tab"
              aria-selected={nav === n.key}
              className={`tab ${nav === n.key ? "active" : ""}`}
              onClick={() => setNav(n.key)}
            >
              {n.label}
            </button>
          ))}
        </div>

        {nav === "tools" && (
          <>
            <div className="toolbar" style={{ marginTop: 14 }}>
              {TOOLS.map((t) => (
                <button
                  key={t.key}
                  className={`small ${activeTool === t.key ? "primary" : "ghost"}`}
                  onClick={() => setActiveTool(t.key)}
                  title={t.short}
                >
                  {t.title}
                </button>
              ))}
            </div>
            <ToolPanel
              tool={currentTool}
              api={api}
              connected={wallet.connected}
              samples={samples}
            />
          </>
        )}

        {nav === "ledger" && <AnalysesPanel api={api} />}
        {nav === "alerts" && <AlertsPanel api={api} />}
        {nav === "cases" && (
          <CaseRegistryPanel api={api} connected={wallet.connected} />
        )}
        {nav === "sources" && (
          <TrustedSourcesPanel api={api} connected={wallet.connected} />
        )}
        {nav === "dashboard" && (
          <>
            <StatsPanel api={api} />
            <ScenariosCard samples={samples} onImport={setSamples} />
          </>
        )}

        <div className="footer">
          Lawguard · GenLayer Intelligent Contract · Every result is source-grounded,
          consensus-validated, and permanently auditable on-chain.
        </div>
      </main>
    </div>
  );
}

/** Contract-address configuration bar with connection guidance. */
function ContractSetup({
  value,
  onChange,
  ready,
  connected,
}: {
  value: string;
  onChange: (v: string) => void;
  ready: boolean;
  connected: boolean;
}) {
  const valid = /^0x[0-9a-fA-F]{40}$/.test(value.trim());
  return (
    <div className="panel" style={{ marginBottom: 8 }}>
      <div className="row-between">
        <div>
          <h2 style={{ fontSize: 16 }}>Connection</h2>
          <p className="desc" style={{ marginBottom: 0 }}>
            {connected ? "Wallet connected." : "Connect your wallet (top-right)."}{" "}
            {ready
              ? "Contract configured — you're ready to run tools."
              : "Enter your deployed Lawguard contract address to enable writes."}
          </p>
        </div>
        <span className={`badge ${ready ? "ok" : "warn"}`}>
          {ready ? "Ready" : "Setup needed"}
        </span>
      </div>
      <div className="toolbar" style={{ marginTop: 12 }}>
        <input
          type="text"
          value={value}
          placeholder="0x… deployed Lawguard contract address"
          onChange={(e) => onChange(e.target.value)}
          style={{ minWidth: 380, flex: 1 }}
        />
        <span className={`badge ${valid ? "ok" : "info"}`}>
          {valid ? "valid" : "0x + 40 hex"}
        </span>
      </div>
    </div>
  );
}

/** Import/export of sample scenarios (JSON + CSV). */
function ScenariosCard({
  samples,
  onImport,
}: {
  samples: SampleScenario[];
  onImport: (s: SampleScenario[]) => void;
}) {
  function download(name: string, content: string, type: string) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportJson() {
    download(
      "lawguard_scenarios.json",
      JSON.stringify({ scenarios: samples }, null, 2),
      "application/json"
    );
  }

  function exportCsv() {
    const rows = [["tool", "label", "fields_json"]];
    for (const s of samples) {
      rows.push([s.tool, s.label, JSON.stringify(s.fields)]);
    }
    const csv = rows
      .map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(","))
      .join("\n");
    download("lawguard_scenarios.csv", csv, "text/csv");
  }

  function importFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        const scenarios = Array.isArray(data) ? data : data.scenarios;
        if (Array.isArray(scenarios)) onImport(scenarios as SampleScenario[]);
      } catch {
        /* ignore malformed imports */
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="panel">
      <h2>Sample scenarios</h2>
      <p className="desc">
        Example inputs for demonstrating each tool. Import your own set, or export
        the current one. Loaded scenarios appear as one-click presets on each tool.
      </p>
      <div className="toolbar">
        <button className="small" onClick={exportJson} disabled={!samples.length}>
          Export JSON
        </button>
        <button className="small" onClick={exportCsv} disabled={!samples.length}>
          Export CSV
        </button>
        <button
          className="small ghost"
          onClick={() => document.getElementById("scenario-import")?.click()}
        >
          Import JSON
        </button>
        <input
          id="scenario-import"
          type="file"
          accept="application/json"
          onChange={importFile}
          style={{ display: "none" }}
        />
        <span className="faint">{samples.length} scenario(s) loaded</span>
      </div>
    </div>
  );
}
