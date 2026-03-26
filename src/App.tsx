import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Cpu, 
  Zap, 
  Activity, 
  Thermometer, 
  Battery, 
  Info,
  ChevronDown,
  Monitor,
  Wind,
  ShieldAlert
} from 'lucide-react';
import { BGA1356_CPUS, CpuSpecs } from './data/cpus';

interface ScenarioResult {
  name: string;
  description: string;
  maxFreq: string;
  sustainedFreq: string;
  consumption: string;
  voltage: string;
  amperage: number;
  tempRange: string;
  isCrashed: boolean;
  crashReason?: string;
  icon: React.ReactNode;
}

export default function App() {
  const [selectedCpu, setSelectedCpu] = useState<CpuSpecs>(BGA1356_CPUS[0]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  
  // Undervolting State
  const [vccCoreOffset, setVccCoreOffset] = useState(0); // in mV
  const [vccCacheOffset, setVccCacheOffset] = useState(0); // in mV
  const [isSynchronous, setIsSynchronous] = useState(true);

  // Power Limits
  const [pl1, setPl1] = useState(15); // Long term (W)
  const [pl2, setPl2] = useState(25); // Short term (W)

  // Cooling Mods
  const [coolingSolution, setCoolingSolution] = useState<'stock' | 'delta' | 'heatpipe' | 'hybrid' | 'airjet'>('stock');
  const [airjetCount, setAirjetCount] = useState(1); // 1 to 4

  // Dynamic Safety Limits
  const cacheSafetyLimit = useMemo(() => {
    const chassisPenalty = selectedCpu.cores > 2 ? 1.2 : 1.0;
    // Cache is the "Secure" rail - limited to stable operational bounds
    // Standard limit is 90mV, adjusted by chassis penalty
    const limit = 90 / chassisPenalty;
    return -Math.floor(limit / 5) * 5;
  }, [selectedCpu]);

  const coreSafetyLimit = -225; // "Unlocked" Core rail as requested

  // Enforce safety limits when CPU changes
  React.useEffect(() => {
    if (vccCoreOffset < coreSafetyLimit) {
      setVccCoreOffset(coreSafetyLimit);
    }
    if (vccCacheOffset < cacheSafetyLimit) {
      setVccCacheOffset(cacheSafetyLimit);
    }
  }, [selectedCpu, cacheSafetyLimit, coreSafetyLimit]);

  // Electrical System Analysis (Top level for UI access)
  // X270 VRM is designed for ~25A peak (2-phase Core VRM)
  const vrmLoad = useMemo(() => {
    const estimatedVoltage = 0.95; // Average operating voltage
    const currentDrawPL2 = pl2 / estimatedVoltage;
    // 8th Gen Quad-Cores stress the X270 VRM 40% more than Dual-Cores due to higher switching frequency and IccMax
    const archMultiplier = selectedCpu.architecture === "Kaby Lake-R" ? 1.4 : 1.0;
    return (currentDrawPL2 / 25) * 100 * archMultiplier; // % of design limit
  }, [pl2, selectedCpu]);

  const handleCoreChange = (val: number) => {
    const clamped = Math.max(coreSafetyLimit, val);
    setVccCoreOffset(clamped);
    // If synced, cache follows core but is still clamped by its own safety limit
    if (isSynchronous) setVccCacheOffset(Math.max(cacheSafetyLimit, clamped));
  };

  const handleCacheChange = (val: number) => {
    const clamped = Math.max(cacheSafetyLimit, val);
    setVccCacheOffset(clamped);
    // If synced, core follows cache (which is always within core's wider limit)
    if (isSynchronous) setVccCoreOffset(clamped);
  };

  const toggleSync = () => {
    setIsSynchronous(!isSynchronous);
    if (!isSynchronous) {
      // When turning ON sync, match cache to core
      setVccCacheOffset(vccCoreOffset);
    }
  };

  const scenarios = useMemo(() => {
    const cpu = selectedCpu;
    
    // Undervolt impact: 
    // Every -10mV offset allows roughly +0.04 GHz sustained frequency in TDP-limited scenarios
    const coreImpact = Math.abs(vccCoreOffset) / 10 * 0.04;
    const cacheImpact = Math.abs(vccCacheOffset) / 10 * 0.01;
    const totalBoost = coreImpact + cacheImpact;

    // Power required for turbo (approximate for 14nm U-series)
    // 1-core turbo: ~11W
    // All-core turbo: ~20W (2C) or ~32W (4C)
    const uvFactor = (1 - Math.abs(vccCoreOffset)/1000);
    const powerReq1Core = 11 * uvFactor;
    const powerReqAllCore = (cpu.cores > 2 ? 32 : 20) * uvFactor;

    // PL2 Throttling
    const burst1CoreThrottle = Math.min(1, pl2 / powerReq1Core);
    const burstAllCoreThrottle = Math.min(1, pl2 / powerReqAllCore);
    
    // Cooling impact
    let coolingBonus = 1.0;
    if (coolingSolution === 'delta') coolingBonus = 1.15; // 15% better airflow
    if (coolingSolution === 'heatpipe') coolingBonus = 1.20; // 20% better heat transfer
    if (coolingSolution === 'hybrid') coolingBonus = 1.35; // Combined effect (~35% better)
    
    // AirJet uses a parallel resistance model: 1/R_total = 1/R_stock + (count / R_airjet)
    // R_airjet is ~8.0°C/W (7.5W @ 60°C delta)
    const R_STOCK = 3.2;
    const R_AIRJET = 8.0;
    
    let currentThermalResistance = R_STOCK / coolingBonus;
    
    if (coolingSolution === 'airjet') {
      const inverseTotal = (1 / R_STOCK) + (airjetCount / R_AIRJET);
      currentThermalResistance = 1 / inverseTotal;
      coolingBonus = R_STOCK / currentThermalResistance;
    }
    const ambientTemp = 35; // Internal chassis ambient under load
    const TJUNCTION = 97;

    const calculateThermalThrottle = (targetWatts: number) => {
      const uvReduction = (Math.abs(vccCoreOffset) * 0.06); // 6C reduction per 100mV
      const potentialTemp = ambientTemp + (targetWatts * currentThermalResistance) - uvReduction;
      
      if (potentialTemp > TJUNCTION) {
        // Calculate how much we need to throttle to stay at TJUNCTION
        const allowedRise = TJUNCTION - ambientTemp + uvReduction;
        const throttledWatts = allowedRise / currentThermalResistance;
        return {
          throttleFactor: Math.max(0.4, throttledWatts / targetWatts),
          finalTemp: TJUNCTION,
          isThrottling: true
        };
      }
      
      return {
        throttleFactor: 1.0,
        finalTemp: Math.round(potentialTemp),
        isThrottling: false
      };
    };

    const checkCrash = (workloadFactor: number, voltageStr: string, watts: number) => {
      const coreOff = Math.abs(vccCoreOffset);
      const cacheOff = Math.abs(vccCacheOffset);
      const weightedOff = (coreOff * 0.25) + (cacheOff * 0.75);
      const tolerance = 1.0;
      const vrmStress = cpu.architecture === "Kaby Lake-R" ? 1.4 : 1.0;
      const chassisPenalty = cpu.cores > 2 ? 1.2 : 1.0;
      const pl2Penalty = Math.max(0, (pl2 - 15) * 0.05 * vrmStress);
      
      const penalty = (weightedOff / (2.8 * tolerance)) * workloadFactor * chassisPenalty * vrmStress + pl2Penalty;
      const syncBonus = isSynchronous ? 5 : 0;
      const stabilityScore = 100 - penalty + syncBonus;

      const voltage = parseFloat(voltageStr);
      const currentAmperage = watts / voltage;
      
      let reason = "";
      let isCrashed = false;

      // Architecture specific voltage underrun limits
      let minVoltage = 0.640; // Default Kaby Lake
      if (cpu.architecture === "Skylake") minVoltage = 0.660;
      if (cpu.architecture === "Kaby Lake-R") minVoltage = 0.620;

      if (stabilityScore < 60) {
        isCrashed = true;
        reason = "Instability (UV/Load)";
      } else if (voltage < minVoltage) {
        isCrashed = true;
        reason = "Voltage Underrun";
      } else if (currentAmperage > 32.5) {
        isCrashed = true;
        reason = "VRM OCP Shutdown";
      }

      return { isCrashed, reason };
    };

    const getTempRange = (watts: number, isBurst: boolean) => {
      const { finalTemp, isThrottling } = calculateThermalThrottle(watts);
      const min = Math.max(38, Math.round(finalTemp * 0.85));
      const max = finalTemp;
      
      if (isBurst && !isThrottling) return `${min}°C - ${Math.min(97, max + 5)}°C`;
      return `${min}°C - ${max}°C`;
    };

    const getThrottledFreq = (baseFreq: number, watts: number) => {
      const { throttleFactor } = calculateThermalThrottle(watts);
      return (baseFreq * throttleFactor).toFixed(2);
    };

    const calculateOperatingVoltage = (freqGhz: number, watts: number, tempStr: string) => {
      // Base V-F Curve (approximate)
      let baseVAt800 = 0.650; // Default Kaby Lake
      if (cpu.architecture === "Skylake") baseVAt800 = 0.670;
      if (cpu.architecture === "Kaby Lake-R") baseVAt800 = 0.630;

      const baseV = baseVAt800 + (freqGhz - 0.8) * 0.171;
      
      // Temperature impact (Leakage/Stability compensation)
      const temp = parseInt(tempStr.split(' ')[2]); 
      const tempAdjustment = Math.max(0, (temp - 50) * 0.0008); 
      
      // Vdroop (Load Line)
      const vDroop = (watts * 0.0012); 
      
      const finalV = baseV + (vccCoreOffset / 1000) + tempAdjustment - vDroop;
      return `${finalV.toFixed(3)} V`;
    };

    const results: ScenarioResult[] = [];
      {
        const idleV = calculateOperatingVoltage(0.8, 1.2, getTempRange(1.2, false));
        const idleCrash = checkCrash(0.05, idleV, 1.2);
        results.push({
          name: "Idle",
          description: "System at rest, background tasks only.",
          maxFreq: "0.80 GHz",
          sustainedFreq: "0.80 GHz",
          consumption: "0.8 - 1.5 W",
          tempRange: getTempRange(1.2, false),
          voltage: idleV,
          amperage: 1.2 / parseFloat(idleV),
          isCrashed: idleCrash.isCrashed,
          crashReason: idleCrash.reason,
          icon: <Battery className="w-5 h-5 text-green-500" />
        });
      }
      {
        const p1c = Math.min(pl2, powerReq1Core);
        const v1c = calculateOperatingVoltage(
          parseFloat(getThrottledFreq(cpu.maxTurbo * burst1CoreThrottle, p1c)), 
          p1c, 
          getTempRange(p1c, true)
        );
        const crash1c = checkCrash(0.35, v1c, p1c);
        results.push({
          name: "1 Core Burst",
          description: "Single-threaded peak performance.",
          maxFreq: `${getThrottledFreq(cpu.maxTurbo * burst1CoreThrottle, p1c)} GHz`,
          sustainedFreq: `${getThrottledFreq(cpu.maxTurbo * 0.95 * burst1CoreThrottle, p1c)} GHz`,
          consumption: `${p1c.toFixed(1)} W`,
          tempRange: getTempRange(p1c, true),
          voltage: v1c,
          amperage: p1c / parseFloat(v1c),
          isCrashed: crash1c.isCrashed,
          crashReason: crash1c.reason,
          icon: <Zap className="w-5 h-5 text-yellow-500" />
        });
      }
      {
        const pac = Math.min(pl2, powerReqAllCore);
        const vac = calculateOperatingVoltage(
          parseFloat(getThrottledFreq(cpu.allCoreTurbo * burstAllCoreThrottle, pac)),
          pac,
          getTempRange(pac, true)
        );
        const crashAc = checkCrash(0.6, vac, pac);
        results.push({
          name: "Dual-Core Workload",
          description: "Multi-threaded burst performance.",
          maxFreq: `${getThrottledFreq(cpu.allCoreTurbo * burstAllCoreThrottle, pac)} GHz`,
          sustainedFreq: `${getThrottledFreq(cpu.allCoreTurbo * 0.85 * burstAllCoreThrottle, pac)} GHz`,
          consumption: `${pac.toFixed(1)} W`,
          tempRange: getTempRange(pac, true),
          voltage: vac,
          amperage: pac / parseFloat(vac),
          isCrashed: crashAc.isCrashed,
          crashReason: crashAc.reason,
          icon: <Activity className="w-5 h-5 text-blue-500" />
        });
      }
      {
        const vsus = calculateOperatingVoltage(
          parseFloat(getThrottledFreq(Math.min(cpu.allCoreTurbo, ((cpu.cores > 2 
            ? Math.max(cpu.baseFreq * 0.75, 1.4) 
            : Math.min(cpu.allCoreTurbo, cpu.baseFreq + 0.2)) * (pl1/15)) + totalBoost), pl1)),
          pl1,
          getTempRange(pl1, false)
        );
        const crashSus = checkCrash(0.85, vsus, pl1);
        results.push({
          name: `${cpu.cores} Core Sustained`,
          description: `Long-term heavy load limited by ${pl1}W TDP.`,
          maxFreq: `${getThrottledFreq(cpu.allCoreTurbo * burstAllCoreThrottle, pl1)} GHz`,
          sustainedFreq: `${getThrottledFreq(Math.min(cpu.allCoreTurbo, ((cpu.cores > 2 
            ? Math.max(cpu.baseFreq * 0.75, 1.4) 
            : Math.min(cpu.allCoreTurbo, cpu.baseFreq + 0.2)) * (pl1/15)) + totalBoost), pl1)} GHz`,
          consumption: `${pl1.toFixed(1)} W (Locked)`,
          tempRange: getTempRange(pl1, false),
          voltage: vsus,
          amperage: pl1 / parseFloat(vsus),
          isCrashed: crashSus.isCrashed,
          crashReason: crashSus.reason,
          icon: <Wind className="w-5 h-5 text-cyan-500" />
        });
      }
      {
        const pMixed = pl1 * 1.2;
        const vMixed = calculateOperatingVoltage(
          parseFloat(getThrottledFreq(((cpu.baseFreq * 0.8) * (pl1/15)) + totalBoost * 0.5, pMixed)),
          pMixed,
          getTempRange(pMixed, false)
        );
        const crashMixed = checkCrash(0.95, vMixed, pMixed);
        results.push({
          name: "Mixed High TDP",
          description: "CPU + iGPU heavy load (e.g. video rendering).",
          maxFreq: `${getThrottledFreq(cpu.allCoreTurbo * 0.8 * burstAllCoreThrottle, pMixed)} GHz`,
          sustainedFreq: `${getThrottledFreq(((cpu.baseFreq * 0.8) * (pl1/15)) + totalBoost * 0.5, pMixed)} GHz`,
          consumption: `${pl1.toFixed(1) } W (Shared)`,
          tempRange: getTempRange(pMixed, false),
          voltage: vMixed,
          amperage: pMixed / parseFloat(vMixed),
          isCrashed: crashMixed.isCrashed,
          crashReason: crashMixed.reason,
          icon: <Thermometer className="w-5 h-5 text-red-500" />
        });
      }
      {
        const p4b = Math.min(pl2, powerReqAllCore * 1.05);
        const v4b = calculateOperatingVoltage(
          parseFloat(getThrottledFreq(cpu.allCoreTurbo * burstAllCoreThrottle, p4b)), 
          p4b, 
          getTempRange(p4b, true)
        );
        const crash4b = checkCrash(0.7, v4b, p4b);
        results.push({
          name: "4 Threads Burst",
          description: "High-intensity short-term workload on 4 logical cores.",
          maxFreq: `${getThrottledFreq(cpu.allCoreTurbo * burstAllCoreThrottle, p4b)} GHz`,
          sustainedFreq: `${getThrottledFreq(cpu.allCoreTurbo * 0.8 * burstAllCoreThrottle, p4b)} GHz`,
          consumption: `${p4b.toFixed(1)} W`,
          tempRange: getTempRange(p4b, true),
          voltage: v4b,
          amperage: p4b / parseFloat(v4b),
          isCrashed: crash4b.isCrashed,
          crashReason: crash4b.reason,
          icon: <Activity className="w-5 h-5 text-indigo-500" />
        });
      }
      {
        const v4s = calculateOperatingVoltage(
          parseFloat(getThrottledFreq(Math.min(cpu.allCoreTurbo, ((cpu.cores > 2 ? cpu.baseFreq : cpu.baseFreq - 0.2) * (pl1/15)) + totalBoost), pl1)), 
          pl1, 
          getTempRange(pl1, false)
        );
        const crash4s = checkCrash(0.8, v4s, pl1);
        results.push({
          name: "4 Threads Sustained",
          description: "Continuous multi-threaded load (e.g. compiling).",
          maxFreq: `${getThrottledFreq(cpu.allCoreTurbo * burstAllCoreThrottle, pl1)} GHz`,
          sustainedFreq: `${getThrottledFreq(Math.min(cpu.allCoreTurbo, ((cpu.cores > 2 ? cpu.baseFreq : cpu.baseFreq - 0.2) * (pl1/15)) + totalBoost), pl1)} GHz`,
          consumption: `${pl1.toFixed(1)} W`,
          tempRange: getTempRange(pl1, false),
          voltage: v4s,
          amperage: pl1 / parseFloat(v4s),
          isCrashed: crash4s.isCrashed,
          crashReason: crash4s.reason,
          icon: <Wind className="w-5 h-5 text-indigo-400" />
        });
      }
      {
        const p8b = Math.min(pl2, powerReqAllCore * 1.2);
        const v8b = calculateOperatingVoltage(
          parseFloat(getThrottledFreq(cpu.allCoreTurbo * 0.9 * burstAllCoreThrottle, p8b)), 
          p8b, 
          getTempRange(p8b, true)
        );
        const crash8b = checkCrash(0.9, v8b, p8b);
        results.push({
          name: "8 Threads Burst",
          description: "Maximum logical core saturation (Burst).",
          maxFreq: `${getThrottledFreq(cpu.allCoreTurbo * 0.9 * burstAllCoreThrottle, p8b)} GHz`,
          sustainedFreq: `${getThrottledFreq(cpu.allCoreTurbo * 0.7 * burstAllCoreThrottle, p8b)} GHz`,
          consumption: `${p8b.toFixed(1)} W`,
          tempRange: getTempRange(p8b, true),
          voltage: v8b,
          amperage: p8b / parseFloat(v8b),
          isCrashed: crash8b.isCrashed,
          crashReason: crash8b.reason,
          icon: <Zap className="w-5 h-5 text-purple-500" />
        });
      }
      {
        const v8s = calculateOperatingVoltage(
          parseFloat(getThrottledFreq(Math.min(cpu.allCoreTurbo, ((cpu.cores > 2 ? cpu.baseFreq * 0.8 : cpu.baseFreq * 0.6) * (pl1/15)) + totalBoost), pl1)), 
          pl1, 
          getTempRange(pl1, false)
        );
        const crash8s = checkCrash(1.0, v8s, pl1);
        results.push({
          name: "8 Threads Sustained",
          description: "Maximum logical core saturation (Sustained).",
          maxFreq: `${getThrottledFreq(cpu.allCoreTurbo * 0.8 * burstAllCoreThrottle, pl1)} GHz`,
          sustainedFreq: `${getThrottledFreq(Math.min(cpu.allCoreTurbo, ((cpu.cores > 2 ? cpu.baseFreq * 0.8 : cpu.baseFreq * 0.6) * (pl1/15)) + totalBoost), pl1)} GHz`,
          consumption: `${pl1.toFixed(1)} W`,
          tempRange: getTempRange(pl1, false),
          voltage: v8s,
          amperage: pl1 / parseFloat(v8s),
          isCrashed: crash8s.isCrashed,
          crashReason: crash8s.reason,
          icon: <Wind className="w-5 h-5 text-purple-400" />
        });
      }

    return results;
  }, [selectedCpu, vccCoreOffset, vccCacheOffset, pl1, pl2, coolingSolution, airjetCount, isSynchronous]);

  return (
    <div className="min-h-screen bg-[#E4E3E0] text-[#141414] font-sans p-4 md:p-8">
      <div className="max-w-[1400px] mx-auto">
        {/* Header */}
        <header className="mb-12 border-b border-[#141414] pb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Cpu className="w-6 h-6" />
              <span className="font-mono text-xs uppercase tracking-widest opacity-50">Hardware Simulation</span>
            </div>
            <h1 className="text-4xl md:text-6xl font-serif italic font-light tracking-tight">
              X270 Chassis <span className="not-italic font-sans font-bold">CPU Dynamics</span>
            </h1>
          </div>
          <div className="text-right">
            <p className="font-mono text-[10px] uppercase opacity-50 mb-1">Target Platform</p>
            <p className="font-medium">ThinkPad X270 (BGA 1356)</p>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Sidebar / Selection */}
          <div className="lg:col-span-1 space-y-6">
            <section className="bg-white p-6 border border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)]">
              <label className="block font-mono text-[10px] uppercase opacity-50 mb-4">Select Processor</label>
              
              <div className="relative">
                <button 
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="w-full flex items-center justify-between p-3 border border-[#141414] hover:bg-[#141414] hover:text-white transition-colors group"
                >
                  <span className="font-medium">{selectedCpu.model}</span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                <AnimatePresence>
                  {isDropdownOpen && (
                    <motion.div 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="absolute z-10 w-full mt-2 bg-white border border-[#141414] shadow-xl max-h-64 overflow-y-auto"
                    >
                      {BGA1356_CPUS.map((cpu) => (
                        <button
                          key={cpu.model}
                          onClick={() => {
                            setSelectedCpu(cpu);
                            setIsDropdownOpen(false);
                          }}
                          className="w-full text-left p-3 hover:bg-[#141414] hover:text-white transition-colors border-b border-gray-100 last:border-0"
                        >
                          <div className="font-medium">{cpu.model}</div>
                          <div className="text-[10px] opacity-60 font-mono">{cpu.cores}C/{cpu.threads}T • {cpu.baseFreq}GHz Base</div>
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </section>

            <section className="bg-white p-6 border border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)]">
              <div className="flex items-center justify-between mb-6">
                <label className="block font-mono text-[10px] uppercase opacity-50">Voltage Control</label>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono uppercase opacity-50">Sync</span>
                  <button 
                    onClick={toggleSync}
                    className={`w-8 h-4 rounded-full relative transition-colors ${isSynchronous ? 'bg-blue-600' : 'bg-gray-300'}`}
                  >
                    <motion.div 
                      animate={{ x: isSynchronous ? 16 : 2 }}
                      className="absolute top-1 w-2 h-2 bg-white rounded-full"
                    />
                  </button>
                </div>
              </div>

              <div className="space-y-8">
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-xs font-bold uppercase">VCC Core</span>
                    <span className="font-mono text-xs text-blue-600">{vccCoreOffset} mV</span>
                  </div>
                  <input 
                    type="range" 
                    min={coreSafetyLimit} 
                    max="0" 
                    step="5"
                    value={vccCoreOffset}
                    onChange={(e) => handleCoreChange(Number(e.target.value))}
                    className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#141414]"
                  />
                </div>

                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-xs font-bold uppercase">VCC Cache</span>
                    <span className="font-mono text-xs text-blue-600">{vccCacheOffset} mV</span>
                  </div>
                  <input 
                    type="range" 
                    min={cacheSafetyLimit} 
                    max="0" 
                    step="5"
                    value={vccCacheOffset}
                    onChange={(e) => handleCacheChange(Number(e.target.value))}
                    className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#141414]"
                  />
                </div>
              </div>

              <div className="mt-8 pt-6 border-t border-gray-100">
                <div className="flex items-center justify-between mb-4">
                  <label className="block font-mono text-[10px] uppercase opacity-50">Live Vcc Estimates</label>
                  <Activity className="w-3 h-3 text-blue-500" />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-gray-50 border border-gray-100">
                    <div className="text-[10px] uppercase font-bold text-gray-400 mb-1">Idle (0.8GHz)</div>
                    <div className="font-mono text-sm font-bold text-[#141414]">
                      {(0.65 + (vccCoreOffset / 1000)).toFixed(3)} V
                    </div>
                  </div>
                  <div className="p-3 bg-gray-50 border border-gray-100">
                    <div className="text-[10px] uppercase font-bold text-gray-400 mb-1">Turbo ({selectedCpu.maxTurbo}GHz)</div>
                    <div className="font-mono text-sm font-bold text-blue-600">
                      {(0.65 + (selectedCpu.maxTurbo - 0.8) * 0.171 + (vccCoreOffset / 1000)).toFixed(3)} V
                    </div>
                  </div>
                </div>
                
              <div className="mt-4 flex flex-col gap-2">
                <div className="flex items-center gap-2 text-[9px] font-mono text-gray-500 uppercase tracking-tighter">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  Stability Threshold: ~1.050V @ Turbo
                </div>
                <div className="flex items-center gap-2 text-[9px] font-mono text-blue-500 uppercase tracking-tighter">
                  <ShieldAlert className="w-3 h-3" />
                  Cache Safety: {cacheSafetyLimit}mV (Secure)
                </div>
                <div className="flex items-center gap-2 text-[9px] font-mono text-purple-500 uppercase tracking-tighter">
                  <Zap className="w-3 h-3" />
                  Core Rail: Unlocked (-225mV)
                </div>
              </div>
              </div>

              <div className="mt-6 p-3 bg-blue-50 border border-blue-100 rounded text-[10px] text-blue-800 leading-tight">
                Undervolting reduces power draw, allowing higher sustained clocks within the 15W TDP limit.
              </div>
            </section>

            <section className="bg-white p-6 border border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)]">
              <label className="block font-mono text-[10px] uppercase opacity-50 mb-6">Power Limits (PL1/PL2)</label>
              
              <div className="space-y-8">
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-xs font-bold uppercase">PL1 (Long Term)</span>
                    <span className="font-mono text-xs text-cyan-600">{pl1} W</span>
                  </div>
                  <input 
                    type="range" 
                    min="5" 
                    max="45" 
                    step="1"
                    value={pl1}
                    onChange={(e) => setPl1(Number(e.target.value))}
                    className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-cyan-600"
                  />
                </div>

                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-xs font-bold uppercase">PL2 (Short Term)</span>
                    <span className="font-mono text-xs text-cyan-600">{pl2} W</span>
                  </div>
                  <input 
                    type="range" 
                    min="10" 
                    max="60" 
                    step="1"
                    value={pl2}
                    onChange={(e) => setPl2(Number(e.target.value))}
                    className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-cyan-600"
                  />
                </div>
              </div>
              <div className="mt-6 p-3 bg-cyan-50 border border-cyan-100 rounded text-[10px] text-cyan-800 leading-tight">
                Increasing PL1 allows higher sustained clocks but increases heat. PL2 governs short-term burst peaks.
              </div>
            </section>

            <section className="bg-white p-6 border border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)]">
              <label className="block font-mono text-[10px] uppercase opacity-50 mb-6">Cooling Solutions</label>
              
              <div className="space-y-3">
                {/* Stock Option */}
                <button 
                  onClick={() => setCoolingSolution('stock')}
                  className={`w-full flex items-center justify-between p-3 border ${coolingSolution === 'stock' ? 'border-black bg-gray-50' : 'border-gray-100 hover:border-gray-300'} transition-all`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full border ${coolingSolution === 'stock' ? 'bg-black border-black' : 'border-gray-300'}`} />
                    <span className="text-xs font-bold uppercase">Stock Cooler</span>
                  </div>
                  <span className="text-[10px] font-mono opacity-50">3.2°C/W</span>
                </button>

                {/* Delta Mod */}
                <button 
                  onClick={() => setCoolingSolution('delta')}
                  className={`w-full flex items-center justify-between p-3 border ${coolingSolution === 'delta' ? 'border-blue-600 bg-blue-50' : 'border-gray-100 hover:border-gray-300'} transition-all`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full border ${coolingSolution === 'delta' ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`} />
                    <div className="flex items-center gap-2">
                      <Wind className="w-3 h-3 text-blue-500" />
                      <span className="text-xs font-bold uppercase">Delta Fan Mod</span>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-blue-600">-15% Res.</span>
                </button>

                {/* Extra Heatpipe */}
                <button 
                  onClick={() => setCoolingSolution('heatpipe')}
                  className={`w-full flex items-center justify-between p-3 border ${coolingSolution === 'heatpipe' ? 'border-purple-600 bg-purple-50' : 'border-gray-100 hover:border-gray-300'} transition-all`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full border ${coolingSolution === 'heatpipe' ? 'bg-purple-600 border-purple-600' : 'border-gray-300'}`} />
                    <div className="flex items-center gap-2">
                      <Activity className="w-3 h-3 text-purple-500" />
                      <span className="text-xs font-bold uppercase">Extra Heatpipe</span>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-purple-600">-20% Res.</span>
                </button>

                {/* Hybrid Mod */}
                <button 
                  onClick={() => setCoolingSolution('hybrid')}
                  className={`w-full flex items-center justify-between p-3 border ${coolingSolution === 'hybrid' ? 'border-red-600 bg-red-50' : 'border-gray-100 hover:border-gray-300'} transition-all`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full border ${coolingSolution === 'hybrid' ? 'bg-red-600 border-red-600' : 'border-gray-300'}`} />
                    <div className="flex items-center gap-2">
                      <Zap className="w-3 h-3 text-red-500" />
                      <span className="text-xs font-bold uppercase">Hybrid (Fan + Pipe)</span>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-red-600">-35% Res.</span>
                </button>

                {/* AirJet */}
                <div className={`p-3 border ${coolingSolution === 'airjet' ? 'border-amber-600 bg-amber-50' : 'border-gray-100 hover:border-gray-300'} transition-all`}>
                  <button 
                    onClick={() => setCoolingSolution('airjet')}
                    className="w-full flex items-center justify-between mb-3"
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full border ${coolingSolution === 'airjet' ? 'bg-amber-600 border-amber-600' : 'border-gray-300'}`} />
                      <div className="flex items-center gap-2">
                        <Zap className="w-3 h-3 text-amber-500" />
                        <span className="text-xs font-bold uppercase">AirJet Mini G2</span>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-amber-600">Solid-State</span>
                  </button>
                  
                  <div className="mb-3 text-[9px] text-amber-800 leading-tight opacity-80">
                    Active heat removal: 7.5W per unit. Uses ultrasonic membranes to generate high-pressure airflow without a traditional fan.
                  </div>

                  {coolingSolution === 'airjet' && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      className="space-y-2 overflow-hidden"
                    >
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] uppercase font-bold">Units</span>
                        <span className="font-mono text-xs">{airjetCount}</span>
                      </div>
                      <input 
                        type="range" 
                        min="1" 
                        max="4" 
                        step="1"
                        value={airjetCount}
                        onChange={(e) => setAirjetCount(Number(e.target.value))}
                        className="w-full h-1 bg-amber-200 rounded-lg appearance-none cursor-pointer accent-amber-600"
                      />
                    </motion.div>
                  )}
                </div>
              </div>
              
              <div className="mt-6 p-3 bg-gray-50 border border-gray-100 rounded text-[10px] text-gray-600 leading-tight italic">
                Note: Selecting a modded solution replaces the stock thermal management. Only one primary cooling mod can be active at a time.
              </div>
            </section>
          </div>

          {/* Main Table */}
          <div className="lg:col-span-2">
            <div className="bg-white border border-[#141414] shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] overflow-hidden">
              <div className="grid grid-cols-7 md:grid-cols-11 p-4 border-b border-[#141414] bg-[#141414] text-white font-mono text-xs uppercase tracking-widest">
                <div className="col-span-1 md:col-span-2">Scenario</div>
                <div className="text-center hidden md:block">Max Freq</div>
                <div className="text-center">Sustained</div>
                <div className="text-center">Power</div>
                <div className="text-center">Temp</div>
                <div className="text-center">Voltage</div>
                <div className="text-center">Amps</div>
                <div className="text-center">Status</div>
                <div className="text-right col-span-1 md:col-span-2">Reason</div>
              </div>

              <div className="divide-y divide-[#141414]">
                {scenarios.map((scenario, idx) => (
                  <motion.div 
                    key={scenario.name}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    className="grid grid-cols-7 md:grid-cols-11 p-4 md:p-6 items-center hover:bg-gray-50 transition-colors group"
                  >
                    <div className="col-span-1 md:col-span-2 flex items-start gap-4">
                      <div className="mt-1 p-2 bg-gray-100 group-hover:bg-white border border-transparent group-hover:border-[#141414] transition-all">
                        {scenario.icon}
                      </div>
                      <div>
                        <h4 className="font-bold text-sm md:text-base">{scenario.name}</h4>
                        <p className="text-[10px] md:text-xs opacity-50 leading-tight mt-1">{scenario.description}</p>
                      </div>
                    </div>

                    <div className="text-center hidden md:block">
                      <span className="font-mono text-base">{scenario.maxFreq}</span>
                    </div>

                    <div className="text-center">
                      <span className="font-mono text-base font-bold text-blue-600">{scenario.sustainedFreq}</span>
                    </div>

                    <div className="text-center">
                      <span className="font-mono text-sm font-bold">{scenario.consumption.split(' ')[0]}W</span>
                    </div>

                    <div className="text-center">
                      <span className="font-mono text-xs font-bold text-orange-600">{scenario.tempRange}</span>
                    </div>

                    <div className="text-center">
                      <span className="font-mono text-sm font-bold text-red-600">{scenario.voltage}</span>
                    </div>

                    <div className="text-center">
                      <span className={`font-mono text-sm font-bold ${scenario.amperage > 25 ? 'text-red-600' : 'text-gray-700'}`}>
                        {scenario.amperage.toFixed(1)}A
                      </span>
                    </div>

                    <div className="text-center">
                      {scenario.isCrashed ? (
                        <motion.span 
                          initial={{ scale: 0.8, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          className="font-mono text-xs font-black text-red-600 bg-red-50 px-2 py-1 border border-red-200"
                        >
                          CRASH
                        </motion.span>
                      ) : (
                        <span className="font-mono text-xs font-bold text-green-600 opacity-50 uppercase tracking-tighter">Stable</span>
                      )}
                    </div>

                    <div className="text-right col-span-1 md:col-span-2">
                      <span className="font-mono text-[10px] text-gray-500 italic">
                        {scenario.isCrashed ? scenario.crashReason : "—"}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Sidebar - Chassis Notes */}
          <div className="lg:col-span-1 space-y-6">
            <section className="bg-[#141414] text-white p-6 border border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)]">
              <div className="flex items-center gap-2 mb-4">
                <Info className="w-4 h-4 text-blue-400" />
                <h3 className="font-mono text-[10px] uppercase tracking-wider">Chassis Notes: X270</h3>
              </div>
              <p className="text-xs leading-relaxed opacity-80 mb-6">
                The X270 utilizes a single-heatpipe cooling solution. Real-world sustained loads are typically governed by the 15W thermal envelope.
              </p>
              
              {selectedCpu.cores > 2 && (
                <div className="p-3 bg-red-900/30 border border-red-500/50 rounded text-[10px] text-red-200 leading-tight flex gap-3 mb-4">
                  <Thermometer className="w-6 h-6 text-red-400 shrink-0" />
                  <div>
                    <span className="font-bold block mb-1 uppercase tracking-tighter">Thermal Density Warning</span>
                    Kaby Lake-R (4-core) in the X270 chassis is highly experimental. Expect 15-20% lower sustained frequencies due to thermal saturation.
                  </div>
                </div>
              )}

              {selectedCpu.cores > 2 && (
                <div className={`p-3 border rounded text-[10px] leading-tight flex gap-3 ${vrmLoad > 100 ? 'bg-orange-900/30 border-orange-500/50 text-orange-200' : 'bg-green-900/30 border-green-500/50 text-green-200'}`}>
                  <ShieldAlert className={`w-6 h-6 shrink-0 ${vrmLoad > 100 ? 'text-orange-400' : 'text-green-400'}`} />
                  <div>
                    <span className="font-bold block mb-1 uppercase tracking-tighter">Electrical Analysis</span>
                    <div className="flex justify-between mb-1">
                      <span>VRM Peak Load:</span>
                      <span className="font-mono">{vrmLoad.toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between mb-1">
                      <span>Current Limit Risk:</span>
                      <span className={`font-mono ${vrmLoad > 100 ? 'text-red-400' : vrmLoad > 80 ? 'text-orange-400' : 'text-green-400'}`}>
                        {vrmLoad > 100 ? 'CRITICAL' : vrmLoad > 80 ? 'HIGH' : 'LOW'}
                      </span>
                    </div>
                    {vrmLoad > 100 && (
                      <p className="opacity-80">
                        Warning: PL2 exceeds VRM specs (~25A). EDP throttling likely.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </section>

            <section className="bg-white p-6 border border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)]">
              <div className="flex items-center gap-2 mb-6">
                <Monitor className="w-4 h-4" />
                <h3 className="font-mono text-[10px] uppercase tracking-wider">Detailed Specifications</h3>
              </div>
              
              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-[10px] uppercase opacity-50 font-mono">Model</span>
                  <span className="text-xs font-bold">{selectedCpu.model}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-[10px] uppercase opacity-50 font-mono">Architecture</span>
                  <span className="text-xs font-bold text-blue-600 italic">{selectedCpu.architecture}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-[10px] uppercase opacity-50 font-mono">Cores / Threads</span>
                  <span className="text-xs font-bold">{selectedCpu.cores}C / {selectedCpu.threads}T</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-[10px] uppercase opacity-50 font-mono">Base Freq</span>
                  <span className="text-xs font-bold">{selectedCpu.baseFreq.toFixed(2)} GHz</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-[10px] uppercase opacity-50 font-mono">Max Turbo</span>
                  <span className="text-xs font-bold text-orange-600">{selectedCpu.maxTurbo.toFixed(2)} GHz</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-[10px] uppercase opacity-50 font-mono">Cache</span>
                  <span className="text-xs font-bold">{selectedCpu.cache}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-[10px] uppercase opacity-50 font-mono">TDP</span>
                  <span className="text-xs font-bold">{selectedCpu.tdp} W</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-[10px] uppercase opacity-50 font-mono">Family</span>
                  <span className="text-xs font-mono">{selectedCpu.family}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-[10px] uppercase opacity-50 font-mono">Stepping</span>
                  <span className="text-xs font-mono">{selectedCpu.stepping}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-[10px] uppercase opacity-50 font-mono">Revisions</span>
                  <div className="flex gap-1">
                    {selectedCpu.revisions.map(rev => (
                      <span key={rev} className="text-[10px] font-mono bg-gray-100 px-1 rounded">{rev}</span>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>

        <footer className="mt-16 pt-8 border-t border-gray-200 flex justify-between items-center text-[10px] font-mono opacity-30 uppercase tracking-widest">
          <span>Simulation Engine v1.0.4</span>
          <span>© 2026 Hardware Labs</span>
        </footer>
      </div>
    </div>
  );
}
