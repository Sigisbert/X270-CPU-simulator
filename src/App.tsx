import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
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
  safetyRange: string;
  amperage: number;
  tempRange: string;
  isCrashed: boolean;
  isThrottled?: boolean;
  crashReason?: string;
  icon: React.ReactNode;
  targetFreq: number;
  targetWatts: number;
  isMixed: boolean;
}

export default function App() {
  const [selectedCpu, setSelectedCpu] = useState<CpuSpecs>(BGA1356_CPUS[0]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  
  // Undervolting State
  const [vccCoreOffset, setVccCoreOffset] = useState(0); // in mV
  const [vccCacheOffset, setVccCacheOffset] = useState(0); // in mV
  const [isSynchronous, setIsSynchronous] = useState(true);

  // Power Limits & XTU
  const [pl1, setPl1] = useState(15); // Long term (W)
  const [pl2, setPl2] = useState(25); // Short term (W)
  const [iccMax, setIccMax] = useState(32); // Amps
  const [tau, setTau] = useState(28); // Seconds
  const [acpiPpcLimit, setAcpiPpcLimit] = useState(100); // % of max freq

  // Cooling Mods
  const [coolingSolution, setCoolingSolution] = useState<'stock' | 'delta' | 'heatpipe' | 'hybrid' | 'airjet'>('stock');
  const [airjetCount, setAirjetCount] = useState(1); // 1 to 4

  // Simulation Settings
  const [simulationScenario, setSimulationScenario] = useState<string>("Dual-Core Workload");
  const [simulationDuration, setSimulationDuration] = useState<number>(4); // in minutes

  // PWM/VRM Constants (NCP81382)
  const PWM_CONTINUOUS_LIMIT = 35; // Amps
  const PWM_PEAK_LIMIT = 70; // Amps (10ms)
  const PWM_THERMAL_WARNING = 150; // Celsius
  const PWM_THERMAL_SHUTDOWN = 180; // Celsius
  const PWM_THETA_JA = 22; // °C/W
  const CHASSIS_TDP_LIMIT = 15; // Watts

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
  // X270 uses 1x 81382 GEJI (35A) for VCCCPUCORE and 1x 81382 GEJI for VCCGPUCore
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
    const archMultiplier = cpu.architecture === "Kaby Lake-R" ? 1.4 : 1.0;
    
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
      // Improved thermal model: 
      // Account for chassis saturation (CHASSIS_TDP_LIMIT)
      const saturationPenalty = targetWatts > CHASSIS_TDP_LIMIT ? (targetWatts - CHASSIS_TDP_LIMIT) * 0.5 : 0;
      const potentialTemp = ambientTemp + (targetWatts * currentThermalResistance) + saturationPenalty - uvReduction;
      
      if (potentialTemp > TJUNCTION) {
        // Calculate how much we need to throttle to stay at TJUNCTION
        const allowedRise = TJUNCTION - ambientTemp + uvReduction - saturationPenalty;
        const throttledWatts = allowedRise / currentThermalResistance;
        return {
          throttleFactor: Math.max(0.3, throttledWatts / targetWatts),
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

    const checkCrash = (workloadFactor: number, voltageStr: string, watts: number, amperage: number, isBurst: boolean) => {
      const voltage = parseFloat(voltageStr);
      
      let reason = "";
      let isCrashed = false;

      // Architecture specific voltage underrun limits
      let minVoltage = 0.640; // Default Kaby Lake
      if (cpu.architecture === "Skylake") minVoltage = 0.660;
      if (cpu.architecture === "Kaby Lake-R") minVoltage = 0.530;

      if (voltage < minVoltage) {
        isCrashed = true;
        reason = "Voltage Underrun";
      } else if (amperage > PWM_PEAK_LIMIT) {
        isCrashed = true;
        reason = `VRM Instant OCP (>${PWM_PEAK_LIMIT}A)`;
      } else if (amperage > PWM_CONTINUOUS_LIMIT && !isBurst) {
        isCrashed = true;
        reason = `VRM Overload (>${PWM_CONTINUOUS_LIMIT}A sustained)`;
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

    const getSafetyVoltageRange = (freqGhz: number) => {
      let baseVAt800 = 0.650;
      let minStableOffset = -0.130;
      let absoluteMax = 1.350;

      if (cpu.architecture === "Skylake") {
        baseVAt800 = 0.670;
        minStableOffset = -0.150;
        absoluteMax = 1.350;
      } else if (cpu.architecture === "Kaby Lake-R") {
        baseVAt800 = 0.630;
        minStableOffset = -0.115;
        absoluteMax = 1.300;
      }

      const baseV = baseVAt800 + (freqGhz - 0.8) * 0.171;
      const minV = baseV + minStableOffset;
      
      return `[${minV.toFixed(3)}V - ${absoluteMax.toFixed(3)}V]`;
    };

    const simulateWorkload = (targetFreq: number, targetWatts: number, isBurst: boolean, isMixed: boolean = false) => {
      // 1. ACPI/UEFI Constraint
      const acpiFreq = targetFreq * (acpiPpcLimit / 100);

      let currentWatts = targetWatts;
      
      // 2. Thermal Throttle
      const { throttleFactor } = calculateThermalThrottle(currentWatts);
      let currentFreq = acpiFreq * throttleFactor;
      
      // 3. IccMax Throttle
      let tempStr = getTempRange(currentWatts, isBurst);
      let voltage = parseFloat(calculateOperatingVoltage(currentFreq, currentWatts, tempStr));
      
      // Split power for separate VRMs if mixed load
      const cpuPowerRatio = isMixed ? 0.7 : 1.0;
      const gpuPowerRatio = isMixed ? 0.3 : 0.0;
      
      let cpuAmperage = ((currentWatts * cpuPowerRatio) / voltage) * archMultiplier;
      let gpuAmperage = ((currentWatts * gpuPowerRatio) / voltage) * archMultiplier;
      
      // Check OCP for both VRMs
      const CPU_VRM_LIMIT = PWM_CONTINUOUS_LIMIT;
      const GPU_VRM_LIMIT = PWM_CONTINUOUS_LIMIT;
      
      if (cpuAmperage > iccMax || gpuAmperage > GPU_VRM_LIMIT) {
        // Iterate slightly to find the stable point
        for (let i = 0; i < 3; i++) {
          const cpuThrottle = iccMax / cpuAmperage;
          const gpuThrottle = GPU_VRM_LIMIT / gpuAmperage;
          const throttle = Math.min(cpuThrottle, gpuThrottle);
          
          if (throttle >= 1) break;
          
          currentWatts *= throttle;
          currentFreq *= throttle;
          tempStr = getTempRange(currentWatts, isBurst);
          voltage = parseFloat(calculateOperatingVoltage(currentFreq, currentWatts, tempStr));
          cpuAmperage = ((currentWatts * cpuPowerRatio) / voltage) * archMultiplier;
          gpuAmperage = ((currentWatts * gpuPowerRatio) / voltage) * archMultiplier;
        }
      }
      
      return {
        freq: currentFreq,
        watts: currentWatts,
        voltage: voltage.toFixed(3) + " V",
        amperage: Math.max(cpuAmperage, gpuAmperage), // Return max load for OCP display
        tempStr,
        isThrottled: cpuAmperage >= iccMax - 0.2 || gpuAmperage >= GPU_VRM_LIMIT - 0.5 || cpuAmperage >= PWM_PEAK_LIMIT - 0.5
      };
    };

    const results: ScenarioResult[] = [];
      {
        const idleFreq = 0.8;
        const sim = simulateWorkload(idleFreq, 1.2, false);
        const idleCrash = checkCrash(0.05, sim.voltage, sim.watts, sim.amperage, false);
        results.push({
          name: "Idle",
          description: "System at rest, background tasks only.",
          maxFreq: "0.80 GHz",
          sustainedFreq: "0.80 GHz",
          consumption: `${sim.watts.toFixed(1)} W`,
          tempRange: sim.tempStr,
          voltage: sim.voltage,
          safetyRange: getSafetyVoltageRange(idleFreq),
          amperage: sim.amperage,
          isCrashed: idleCrash.isCrashed,
          isThrottled: sim.isThrottled,
          crashReason: idleCrash.reason,
          icon: <Battery className="w-5 h-5 text-green-500" />,
          targetFreq: idleFreq,
          targetWatts: 1.2,
          isMixed: false
        });
      }
      {
        const p1c = Math.min(pl2, powerReq1Core);
        const sim = simulateWorkload(cpu.maxTurbo * burst1CoreThrottle, p1c, true);
        const crash1c = checkCrash(0.35, sim.voltage, sim.watts, sim.amperage, true);
        const tauFactor = 0.5 + 0.5 * Math.min(1, tau / 28);
        const susSim = simulateWorkload(cpu.maxTurbo * 0.95 * burst1CoreThrottle, p1c, true);
        
        results.push({
          name: "1 Core Burst",
          description: "Single-threaded peak performance.",
          maxFreq: `${sim.freq.toFixed(2)} GHz`,
          sustainedFreq: `${(susSim.freq * tauFactor).toFixed(2)} GHz`,
          consumption: `${sim.watts.toFixed(1)} W`,
          tempRange: sim.tempStr,
          voltage: sim.voltage,
          safetyRange: getSafetyVoltageRange(sim.freq),
          amperage: sim.amperage,
          isCrashed: crash1c.isCrashed,
          isThrottled: sim.isThrottled,
          crashReason: crash1c.reason,
          icon: <Zap className="w-5 h-5 text-yellow-500" />,
          targetFreq: cpu.maxTurbo * burst1CoreThrottle,
          targetWatts: p1c,
          isMixed: false
        });
      }
      {
        const pac = Math.min(pl2, powerReqAllCore);
        const sim = simulateWorkload(cpu.allCoreTurbo * burstAllCoreThrottle, pac, true);
        const crashAc = checkCrash(0.6, sim.voltage, sim.watts, sim.amperage, true);
        const tauFactor = 0.5 + 0.5 * Math.min(1, tau / 28);
        const susSim = simulateWorkload(cpu.allCoreTurbo * 0.85 * burstAllCoreThrottle, pac, true);
        results.push({
          name: "Dual-Core Workload",
          description: "Multi-threaded burst performance.",
          maxFreq: `${sim.freq.toFixed(2)} GHz`,
          sustainedFreq: `${(susSim.freq * tauFactor).toFixed(2)} GHz`,
          consumption: `${sim.watts.toFixed(1)} W`,
          tempRange: sim.tempStr,
          voltage: sim.voltage,
          safetyRange: getSafetyVoltageRange(sim.freq),
          amperage: sim.amperage,
          isCrashed: crashAc.isCrashed,
          isThrottled: sim.isThrottled,
          crashReason: crashAc.reason,
          icon: <Activity className="w-5 h-5 text-blue-500" />,
          targetFreq: cpu.allCoreTurbo * burstAllCoreThrottle,
          targetWatts: pac,
          isMixed: false
        });
      }
      {
        const freqSus = Math.min(cpu.allCoreTurbo, ((cpu.cores > 2 
            ? Math.max(cpu.baseFreq * 0.75, 1.4) 
            : Math.min(cpu.allCoreTurbo, cpu.baseFreq + 0.2)) * (pl1/15)) + totalBoost);
        const sim = simulateWorkload(freqSus, pl1, false);
        const crashSus = checkCrash(0.85, sim.voltage, sim.watts, sim.amperage, false);
        const maxSim = simulateWorkload(cpu.allCoreTurbo * burstAllCoreThrottle, pl1, true);
        results.push({
          name: `${cpu.cores} Core Sustained`,
          description: `Long-term heavy load limited by ${pl1}W TDP.`,
          maxFreq: `${maxSim.freq.toFixed(2)} GHz`,
          sustainedFreq: `${sim.freq.toFixed(2)} GHz`,
          consumption: `${sim.watts.toFixed(1)} W (Locked)`,
          tempRange: sim.tempStr,
          voltage: sim.voltage,
          safetyRange: getSafetyVoltageRange(sim.freq),
          amperage: sim.amperage,
          isCrashed: crashSus.isCrashed,
          isThrottled: sim.isThrottled,
          crashReason: crashSus.reason,
          icon: <Wind className="w-5 h-5 text-cyan-500" />,
          targetFreq: freqSus,
          targetWatts: pl1,
          isMixed: false
        });
      }
      {
        const pMixed = pl1 * 1.2;
        const freqMixed = ((cpu.baseFreq * 0.8) * (pl1/15)) + totalBoost * 0.5;
        
        // Run a mini-simulation to get dynamic results for the table
        let totalWatts = 0;
        let totalFreq = 0;
        let maxTemp = 40;
        let maxWatts = 0;
        let maxFreq = 0;
        let isThrottled = false;
        let isCrashed = false;
        let crashReason = "";
        
        let currentTemp = 40;
        let vrmTemp = 45;
        let burstTimer = 0;
        let currentBurstMultiplier = 1.0;
        
        const R_STOCK = 3.2;
        const R_AIRJET = 8.0;
        let currentThermalResistance = R_STOCK / coolingBonus;
        if (coolingSolution === 'airjet') {
          const inverseTotal = (1 / R_STOCK) + (airjetCount / R_AIRJET);
          currentThermalResistance = 1 / inverseTotal;
        }
        
        const uvReduction = (Math.abs(vccCoreOffset) * 0.06);
        const ambientTemp = 35;
        const TJUNCTION = 97;
        const CHASSIS_TDP_LIMIT = 15;
        const VRM_AMBIENT = 40;
        
        for (let t = 0; t <= 60; t++) {
          let currentLimit = t <= tau ? pl2 : pl1;
          if (vrmTemp > PWM_THERMAL_WARNING) {
            currentLimit = Math.min(currentLimit, pl1);
          }
          
          let targetWatts = Math.min(currentLimit, pMixed);
          let targetFreq = freqMixed * (acpiPpcLimit / 100);
          
          if (burstTimer > 0) {
            burstTimer--;
            if (vrmTemp <= PWM_THERMAL_WARNING) {
              currentLimit = pl2;
            }
            targetWatts = pl2 * currentBurstMultiplier;
            targetFreq = cpu.maxTurbo * currentBurstMultiplier;
          } else {
            if (Math.random() < 0.03) {
              burstTimer = Math.floor(Math.random() * 4) + 2;
              currentBurstMultiplier = 0.85 + Math.random() * 0.15;
            }
            const wave1 = Math.sin(t / 3.1) * 0.10;
            const wave2 = Math.sin(t / 7.3) * 0.15;
            const wave3 = Math.sin(t / 11.7) * 0.05;
            const jitter = (Math.random() - 0.5) * 0.20;
            const noiseFactor = 1.0 + wave1 + wave2 + wave3 + jitter;
            targetWatts = pMixed * noiseFactor;
            targetFreq = freqMixed * noiseFactor;
          }
          
          targetWatts = Math.min(currentLimit, Math.max(3, targetWatts));
          targetFreq = Math.min(cpu.maxTurbo, Math.max(0.8, targetFreq));
          
          const saturationPenalty = targetWatts > CHASSIS_TDP_LIMIT ? (targetWatts - CHASSIS_TDP_LIMIT) * 0.5 : 0;
          const steadyStateTemp = ambientTemp + (targetWatts * currentThermalResistance) + saturationPenalty - uvReduction;
          currentTemp = currentTemp + (steadyStateTemp - currentTemp) * 0.05;
          
          let actualWatts = targetWatts;
          let actualFreq = targetFreq;
          
          if (currentTemp > TJUNCTION) {
            currentTemp = TJUNCTION;
            const allowedRise = TJUNCTION - ambientTemp + uvReduction - saturationPenalty;
            actualWatts = allowedRise / currentThermalResistance;
            const throttleFactor = Math.max(0.3, actualWatts / targetWatts);
            actualFreq = targetFreq * throttleFactor;
            isThrottled = true;
          }
          
          let baseVAt800 = 0.650;
          if (cpu.architecture === "Skylake") baseVAt800 = 0.670;
          if (cpu.architecture === "Kaby Lake-R") baseVAt800 = 0.630;
          const baseV = baseVAt800 + (actualFreq - 0.8) * 0.171;
          const tempAdjustment = Math.max(0, (currentTemp - 50) * 0.0008);
          const vDroop = (actualWatts * 0.0012);
          const voltage = baseV + (vccCoreOffset / 1000) + tempAdjustment - vDroop;
          
          let amperage = (actualWatts / voltage) * archMultiplier;
          if (amperage > iccMax) {
            const throttle = iccMax / amperage;
            actualWatts *= throttle;
            actualFreq *= throttle;
            amperage = iccMax;
            isThrottled = true;
          }
          
          const baseEfficiency = Math.max(0.65, 0.92 - Math.pow(amperage / 35, 2) * 0.15);
          const tempPenalty = Math.max(0, (vrmTemp - 80) * 0.002);
          const efficiency = Math.max(0.5, baseEfficiency - tempPenalty);
          const vrmPowerLoss = actualWatts * ((1 / efficiency) - 1);
          
          const fanAirflowFactor = Math.max(0, Math.min(1.0, (currentTemp - 45) / 35.0)); 
          const airflowCoolingBenefit = 1.0 - (fanAirflowFactor * 0.45); 
          const vrmThetaJA = 22 * airflowCoolingBenefit / Math.pow(coolingBonus, 1.5);
          const vrmSteadyState = VRM_AMBIENT + (vrmPowerLoss * vrmThetaJA);
          vrmTemp = vrmTemp + (vrmSteadyState - vrmTemp) * 0.02;
          
          const crashCheck = checkCrash(0.95, voltage.toFixed(3) + " V", actualWatts, amperage, false);
          if (crashCheck.isCrashed) {
            isCrashed = true;
            crashReason = crashCheck.reason;
          }
          
          totalWatts += actualWatts;
          totalFreq += actualFreq;
          maxWatts = Math.max(maxWatts, actualWatts);
          maxFreq = Math.max(maxFreq, actualFreq);
          maxTemp = Math.max(maxTemp, currentTemp);
        }
        
        const avgWatts = totalWatts / 61;
        const avgFreq = totalFreq / 61;
        
        // Use the static simulator just to format the voltage/amperage for the average state
        const sim = simulateWorkload(avgFreq, avgWatts, false, true);
        
        results.push({
          name: "Mixed High TDP",
          description: "CPU + iGPU heavy load (e.g. video rendering).",
          maxFreq: `${maxFreq.toFixed(2)} GHz`,
          sustainedFreq: `~${avgFreq.toFixed(2)} GHz (Avg)`,
          consumption: `~${avgWatts.toFixed(1)} W (Avg)`,
          tempRange: `40°C - ${Math.round(maxTemp)}°C`,
          voltage: sim.voltage,
          safetyRange: getSafetyVoltageRange(avgFreq),
          amperage: sim.amperage,
          isCrashed: isCrashed,
          isThrottled: isThrottled,
          crashReason: crashReason,
          icon: <Thermometer className="w-5 h-5 text-red-500" />,
          targetFreq: freqMixed,
          targetWatts: pMixed,
          isMixed: true
        });
      }
      {
        const p4b = Math.min(pl2, powerReqAllCore * 1.05);
        const sim = simulateWorkload(cpu.allCoreTurbo * burstAllCoreThrottle, p4b, true);
        const crash4b = checkCrash(0.7, sim.voltage, sim.watts, sim.amperage, true);
        const tauFactor = 0.5 + 0.5 * Math.min(1, tau / 28);
        const susSim = simulateWorkload(cpu.allCoreTurbo * 0.8 * burstAllCoreThrottle, p4b, true);
        results.push({
          name: "4 Threads Burst",
          description: "High-intensity short-term workload on 4 logical cores.",
          maxFreq: `${sim.freq.toFixed(2)} GHz`,
          sustainedFreq: `${(susSim.freq * tauFactor).toFixed(2)} GHz`,
          consumption: `${sim.watts.toFixed(1)} W`,
          tempRange: sim.tempStr,
          voltage: sim.voltage,
          safetyRange: getSafetyVoltageRange(sim.freq),
          amperage: sim.amperage,
          isCrashed: crash4b.isCrashed,
          isThrottled: sim.isThrottled,
          crashReason: crash4b.reason,
          icon: <Activity className="w-5 h-5 text-indigo-500" />,
          targetFreq: cpu.allCoreTurbo * burstAllCoreThrottle,
          targetWatts: p4b,
          isMixed: false
        });
      }
      {
        const freq4s = Math.min(cpu.allCoreTurbo, ((cpu.cores > 2 ? cpu.baseFreq : cpu.baseFreq - 0.2) * (pl1/15)) + totalBoost);
        const sim = simulateWorkload(freq4s, pl1, false);
        const crash4s = checkCrash(0.8, sim.voltage, sim.watts, sim.amperage, false);
        const maxSim = simulateWorkload(cpu.allCoreTurbo * burstAllCoreThrottle, pl1, true);
        results.push({
          name: "4 Threads Sustained",
          description: "Continuous multi-threaded load (e.g. compiling).",
          maxFreq: `${maxSim.freq.toFixed(2)} GHz`,
          sustainedFreq: `${sim.freq.toFixed(2)} GHz`,
          consumption: `${sim.watts.toFixed(1)} W`,
          tempRange: sim.tempStr,
          voltage: sim.voltage,
          safetyRange: getSafetyVoltageRange(sim.freq),
          amperage: sim.amperage,
          isCrashed: crash4s.isCrashed,
          isThrottled: sim.isThrottled,
          crashReason: crash4s.reason,
          icon: <Wind className="w-5 h-5 text-indigo-400" />,
          targetFreq: freq4s,
          targetWatts: pl1,
          isMixed: false
        });
      }
      {
        const p8b = Math.min(pl2, powerReqAllCore * 1.2);
        const sim = simulateWorkload(cpu.allCoreTurbo * 0.9 * burstAllCoreThrottle, p8b, true);
        const crash8b = checkCrash(0.9, sim.voltage, sim.watts, sim.amperage, true);
        const tauFactor = 0.5 + 0.5 * Math.min(1, tau / 28);
        const susSim = simulateWorkload(cpu.allCoreTurbo * 0.7 * burstAllCoreThrottle, p8b, true);
        results.push({
          name: "8 Threads Burst",
          description: "Maximum logical core saturation (Burst).",
          maxFreq: `${sim.freq.toFixed(2)} GHz`,
          sustainedFreq: `${(susSim.freq * tauFactor).toFixed(2)} GHz`,
          consumption: `${sim.watts.toFixed(1)} W`,
          tempRange: sim.tempStr,
          voltage: sim.voltage,
          safetyRange: getSafetyVoltageRange(sim.freq),
          amperage: sim.amperage,
          isCrashed: crash8b.isCrashed,
          isThrottled: sim.isThrottled,
          crashReason: crash8b.reason,
          icon: <Zap className="w-5 h-5 text-purple-500" />,
          targetFreq: cpu.allCoreTurbo * 0.9 * burstAllCoreThrottle,
          targetWatts: p8b,
          isMixed: false
        });
      }
      {
        const freq8s = Math.min(cpu.allCoreTurbo, ((cpu.cores > 2 ? cpu.baseFreq * 0.8 : cpu.baseFreq * 0.6) * (pl1/15)) + totalBoost);
        const sim = simulateWorkload(freq8s, pl1, false);
        const crash8s = checkCrash(1.0, sim.voltage, sim.watts, sim.amperage, false);
        const maxSim = simulateWorkload(cpu.allCoreTurbo * 0.8 * burstAllCoreThrottle, pl1, true);
        results.push({
          name: "8 Threads Sustained",
          description: "Maximum logical core saturation (Sustained).",
          maxFreq: `${maxSim.freq.toFixed(2)} GHz`,
          sustainedFreq: `${sim.freq.toFixed(2)} GHz`,
          consumption: `${sim.watts.toFixed(1)} W`,
          tempRange: sim.tempStr,
          voltage: sim.voltage,
          safetyRange: getSafetyVoltageRange(sim.freq),
          amperage: sim.amperage,
          isCrashed: crash8s.isCrashed,
          isThrottled: sim.isThrottled,
          crashReason: crash8s.reason,
          icon: <Wind className="w-5 h-5 text-purple-400" />,
          targetFreq: freq8s,
          targetWatts: pl1,
          isMixed: false
        });
      }

    return results;
  }, [selectedCpu, vccCoreOffset, vccCacheOffset, pl1, pl2, iccMax, tau, coolingSolution, airjetCount, isSynchronous, acpiPpcLimit]);

  const stressTestData = useMemo(() => {
    const data = [];
    const cpu = selectedCpu;
    const archMultiplier = cpu.architecture === "Kaby Lake-R" ? 1.4 : 1.0;
    
    // Find the selected scenario
    const scenario = scenarios.find(s => s.name === simulationScenario) || scenarios[0];
    
    // Cooling calculations
    let coolingBonus = 1.0;
    if (coolingSolution === 'delta') coolingBonus = 1.15;
    if (coolingSolution === 'heatpipe') coolingBonus = 1.20;
    if (coolingSolution === 'hybrid') coolingBonus = 1.35;
    
    const R_STOCK = 3.2;
    const R_AIRJET = 8.0;
    let currentThermalResistance = R_STOCK / coolingBonus;
    if (coolingSolution === 'airjet') {
      const inverseTotal = (1 / R_STOCK) + (airjetCount / R_AIRJET);
      currentThermalResistance = 1 / inverseTotal;
      coolingBonus = R_STOCK / currentThermalResistance;
    }
    
    const ambientTemp = 35;
    const TJUNCTION = 97;
    const CHASSIS_TDP_LIMIT = 15;
    
    const uvReduction = (Math.abs(vccCoreOffset) * 0.06);
    
    let currentTemp = 40; // Start at 40C
    let vrmTemp = 45; // VRM starts at 45C
    const VRM_AMBIENT = 40;
    
    const durationSeconds = simulationDuration * 60;
    // To keep the graph performant, we'll sample data points based on duration
    const step = Math.max(1, Math.floor(durationSeconds / 120)); 
    
    let isVrmShutdown = false;
    let burstTimer = 0;
    let currentBurstMultiplier = 1.0;

    for (let t = 0; t <= durationSeconds; t++) {
      if (isVrmShutdown) {
        if (t % step === 0 || t === durationSeconds) {
          data.push({
            time: t,
            temperature: Math.round(currentTemp),
            vrmTemp: Math.round(vrmTemp),
            power: 0,
            frequency: 0,
          });
        }
        // Cool down
        currentTemp = currentTemp + (ambientTemp - currentTemp) * 0.05;
        vrmTemp = vrmTemp + (VRM_AMBIENT - vrmTemp) * 0.1;
        continue;
      }

      // Determine power limit for this second
      let currentLimit = t <= tau ? pl2 : pl1;
      
      // Motherboard PROCHOT / VRM Thermal Warning response
      if (vrmTemp > PWM_THERMAL_WARNING) {
        currentLimit = Math.min(currentLimit, pl1); // Force PL1 if VRM is overheating
      }
      
      // The CPU wants to draw targetWatts to hit targetFreq
      let targetWatts = Math.min(currentLimit, scenario.targetWatts);
      let targetFreq = scenario.targetFreq;
      
      // ACPI Constraint
      targetFreq = targetFreq * (acpiPpcLimit / 100);
      
      // Add randomness for mixed workloads
      if (scenario.isMixed) {
        // Handle burst charges (sudden spikes to PL2)
        if (burstTimer > 0) {
          burstTimer--;
          // Override currentLimit to allow PL2 bursts, unless VRM is overheating
          if (vrmTemp <= PWM_THERMAL_WARNING) {
            currentLimit = pl2;
          }
          targetWatts = pl2 * currentBurstMultiplier;
          targetFreq = cpu.maxTurbo * currentBurstMultiplier;
        } else {
          // 3% chance per second to trigger a sudden burst charge
          if (Math.random() < 0.03) {
            burstTimer = Math.floor(Math.random() * 4) + 2; // 2 to 5 seconds
            currentBurstMultiplier = 0.85 + Math.random() * 0.15; // 85% to 100% of PL2
          }
          
          // Irregular base fluctuation using prime-based sine waves and larger random jitter
          const wave1 = Math.sin(t / 3.1) * 0.10;
          const wave2 = Math.sin(t / 7.3) * 0.15;
          const wave3 = Math.sin(t / 11.7) * 0.05;
          const jitter = (Math.random() - 0.5) * 0.20; // 20% random jitter
          
          const noiseFactor = 1.0 + wave1 + wave2 + wave3 + jitter;
          
          targetWatts = scenario.targetWatts * noiseFactor;
          targetFreq = scenario.targetFreq * noiseFactor;
        }
        
        // Clamp to realistic bounds
        targetWatts = Math.min(currentLimit, Math.max(3, targetWatts));
        targetFreq = Math.min(cpu.maxTurbo, Math.max(0.8, targetFreq));
      }
      
      // Calculate thermal dynamics
      const saturationPenalty = targetWatts > CHASSIS_TDP_LIMIT ? (targetWatts - CHASSIS_TDP_LIMIT) * 0.5 : 0;
      const steadyStateTemp = ambientTemp + (targetWatts * currentThermalResistance) + saturationPenalty - uvReduction;
      
      // Thermal mass factor (how fast it heats up/cools down)
      currentTemp = currentTemp + (steadyStateTemp - currentTemp) * 0.05;
      
      let actualWatts = targetWatts;
      let actualFreq = targetFreq;
      
      if (currentTemp > TJUNCTION) {
        currentTemp = TJUNCTION;
        // Back-calculate allowed watts
        const allowedRise = TJUNCTION - ambientTemp + uvReduction - saturationPenalty;
        actualWatts = allowedRise / currentThermalResistance;
        const throttleFactor = Math.max(0.3, actualWatts / targetWatts);
        actualFreq = targetFreq * throttleFactor;
      }
      
      // IccMax Throttle
      let baseVAt800 = 0.650;
      if (cpu.architecture === "Skylake") baseVAt800 = 0.670;
      if (cpu.architecture === "Kaby Lake-R") baseVAt800 = 0.630;
      const baseV = baseVAt800 + (actualFreq - 0.8) * 0.171;
      const tempAdjustment = Math.max(0, (currentTemp - 50) * 0.0008);
      const vDroop = (actualWatts * 0.0012);
      const voltage = baseV + (vccCoreOffset / 1000) + tempAdjustment - vDroop;
      
      let amperage = (actualWatts / voltage) * archMultiplier;
      
      if (amperage > iccMax) {
        const throttle = iccMax / amperage;
        actualWatts *= throttle;
        actualFreq *= throttle;
        amperage = iccMax;
      }
      
      // VRM Thermal Simulation
      // Efficiency drops significantly at high loads and high temperatures
      const baseEfficiency = Math.max(0.65, 0.92 - Math.pow(amperage / 35, 2) * 0.15);
      const tempPenalty = Math.max(0, (vrmTemp - 80) * 0.002); // Efficiency drops above 80C
      const efficiency = Math.max(0.5, baseEfficiency - tempPenalty);
      
      const vrmPowerLoss = actualWatts * ((1 / efficiency) - 1);
      
      // Incidental Airflow Model:
      // The CPU fan spins faster as CPU temperature increases, pulling air over the PCB.
      // Fan curve proxy: <45C = 0% fan, 80C+ = 100% fan effect on VRM.
      const fanAirflowFactor = Math.max(0, Math.min(1.0, (currentTemp - 45) / 35.0)); 
      
      // Base ThetaJA is 22 (still air). With max incidental airflow, it drops significantly (e.g., by 45%).
      const airflowCoolingBenefit = 1.0 - (fanAirflowFactor * 0.45); 
      
      // Apply cooling solution bonus (better fans/mods move more air directly over VRMs)
      // We use Math.pow(coolingBonus, 1.5) to ensure the VRM benefits strongly from the upgrade
      // and offsets the fact that a cooler CPU means slower fan speeds.
      const vrmThetaJA = PWM_THETA_JA * airflowCoolingBenefit / Math.pow(coolingBonus, 1.5); 
      
      const vrmSteadyState = VRM_AMBIENT + (vrmPowerLoss * vrmThetaJA);
      vrmTemp = vrmTemp + (vrmSteadyState - vrmTemp) * 0.02; // VRM heats up slower than CPU

      if (vrmTemp > PWM_THERMAL_SHUTDOWN) {
        isVrmShutdown = true;
        actualWatts = 0;
        actualFreq = 0;
      }
      
      if (t % step === 0 || t === durationSeconds) {
        data.push({
          time: t,
          temperature: Math.round(currentTemp),
          vrmTemp: Math.round(vrmTemp),
          power: Number(actualWatts.toFixed(1)),
          frequency: Number(actualFreq.toFixed(2)),
        });
      }
    }
    return data;
  }, [selectedCpu, vccCoreOffset, pl1, pl2, iccMax, tau, coolingSolution, airjetCount, acpiPpcLimit, scenarios, simulationScenario, simulationDuration]);

  // Electrical System Analysis (Top level for UI access)
  // X270 uses 1x 81382 GEJI (35A) for VCCCPUCORE and 1x 81382 GEJI for VCCGPUCore
  const vrmLoad = useMemo(() => {
    // Find the maximum amperage across all calculated scenarios
    const maxAmperage = scenarios.length > 0 ? Math.max(...scenarios.map(s => s.amperage)) : 0;
    
    const designLimit = 35; // 81382 GEJI is a 35A part
    return (maxAmperage / designLimit) * 100; // % of design limit
  }, [scenarios]);

  return (
    <div className="min-h-screen bg-[#E4E3E0] text-[#141414] font-sans p-4 md:p-8">
      <div className="max-w-[1860px] mx-auto">
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
              <label className="block font-mono text-[10px] uppercase opacity-50 mb-6">XTU Parameters</label>
              
              {/* Voltage Control Subcategory */}
              <div className="mb-8">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-mono text-[10px] uppercase font-bold tracking-widest">Voltage Control</h3>
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

                <div className="space-y-6">
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

                <div className="mt-6 pt-6 border-t border-gray-100">
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
              </div>

              {/* Power Limits Subcategory */}
              <div className="pt-6 border-t border-gray-200">
                <h3 className="font-mono text-[10px] uppercase font-bold tracking-widest mb-4">Power Limits (PL1/PL2)</h3>
                
                <div className="space-y-6">
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
                  
                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="text-xs font-bold uppercase">IccMax (Core Current)</span>
                      <span className="font-mono text-xs text-cyan-600">{iccMax} A</span>
                    </div>
                    <input 
                      type="range" 
                      min="10" 
                      max="60" 
                      step="1"
                      value={iccMax}
                      onChange={(e) => setIccMax(Number(e.target.value))}
                      className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-cyan-600"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="text-xs font-bold uppercase">ACPI PPC Limit</span>
                      <span className="font-mono text-xs text-cyan-600">{acpiPpcLimit} %</span>
                    </div>
                    <input 
                      type="range" 
                      min="50" 
                      max="100" 
                      step="1"
                      value={acpiPpcLimit}
                      onChange={(e) => setAcpiPpcLimit(Number(e.target.value))}
                      className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-cyan-600"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="text-xs font-bold uppercase">Tau (Turbo Time)</span>
                      <span className="font-mono text-xs text-cyan-600">{tau} s</span>
                    </div>
                    <input 
                      type="range" 
                      min="1" 
                      max="96" 
                      step="1"
                      value={tau}
                      onChange={(e) => setTau(Number(e.target.value))}
                      className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-cyan-600"
                    />
                  </div>
                </div>
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
            </section>


          </div>

          {/* Main Table */}
          <div className="lg:col-span-2">
            <div className="bg-white border border-[#141414] shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] overflow-hidden">
              <div className="grid grid-cols-7 md:grid-cols-[1.8fr_1fr_1fr_0.9fr_1fr_1fr_1fr_1fr_2fr] p-4 border-b border-[#141414] bg-[#141414] text-white font-mono text-xs uppercase tracking-widest">
                <div className="col-span-1">Scenario</div>
                <div className="text-center hidden md:block">Max Freq</div>
                <div className="text-center">Sustained</div>
                <div className="text-center">Power</div>
                <div className="text-center">Temp</div>
                <div className="text-center">Voltage</div>
                <div className="text-center">Amps</div>
                <div className="text-center">Status</div>
                <div className="text-right col-span-1">Reason</div>
              </div>

              <div className="divide-y divide-[#141414]">
                {scenarios.map((scenario, idx) => (
                  <motion.div 
                    key={scenario.name}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    className="grid grid-cols-7 md:grid-cols-[1.8fr_1fr_1fr_0.9fr_1fr_1fr_1fr_1fr_2fr] p-4 md:p-6 items-center hover:bg-gray-50 transition-colors group"
                  >
                    <div className="col-span-1 flex items-start gap-4">
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

                    <div className="text-center flex flex-col items-center justify-center">
                      <span className="font-mono text-sm font-bold text-red-600">{scenario.voltage}</span>
                      <span className="font-mono text-[9px] text-gray-400 mt-0.5">{scenario.safetyRange}</span>
                    </div>

                    <div className="text-center">
                      <span className={`font-mono text-sm font-bold ${scenario.amperage > 35 ? 'text-red-600' : scenario.amperage > 28 ? 'text-orange-600' : 'text-gray-700'}`}>
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
                      ) : scenario.isThrottled ? (
                        <span className="font-mono text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-1 border border-orange-200 uppercase tracking-tighter">
                          EDP Throttled
                        </span>
                      ) : (
                        <span className="font-mono text-xs font-bold text-green-600 opacity-50 uppercase tracking-tighter">Stable</span>
                      )}
                    </div>

                    <div className="text-right col-span-1">
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
                      <span className="font-mono">{vrmLoad.toFixed(1)}% (of 35A)</span>
                    </div>
                    <div className="flex justify-between mb-1">
                      <span>Current Limit Risk:</span>
                      <span className={`font-mono ${vrmLoad > 100 ? 'text-red-400' : vrmLoad > 80 ? 'text-orange-400' : 'text-green-400'}`}>
                        {vrmLoad > 100 ? 'CRITICAL' : vrmLoad > 80 ? 'HIGH' : 'LOW'}
                      </span>
                    </div>
                    {vrmLoad > 100 && (
                      <p className="opacity-80">
                        Warning: PL2 pushes the single-phase 81382 GEJI VRM near its 35A limit. EDP throttling or OCP shutdown likely.
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

        {/* Stress Test Graph */}
        <div className="mt-8 bg-white border border-[#141414] shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5" />
              <h3 className="font-mono text-sm uppercase tracking-wider font-bold">Stress Test Simulation</h3>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex items-center gap-2">
                <label className="font-mono text-[10px] uppercase opacity-50">Scenario:</label>
                <select 
                  value={simulationScenario}
                  onChange={(e) => setSimulationScenario(e.target.value)}
                  className="bg-gray-50 border border-gray-200 text-xs font-mono p-1.5 rounded focus:outline-none focus:border-[#141414]"
                >
                  {scenarios.map(s => (
                    <option key={s.name} value={s.name}>{s.name}</option>
                  ))}
                </select>
              </div>
              
              <div className="flex items-center gap-2">
                <label className="font-mono text-[10px] uppercase opacity-50">Duration:</label>
                <input 
                  type="range" 
                  min="4" 
                  max="150" 
                  step="1"
                  value={simulationDuration}
                  onChange={(e) => setSimulationDuration(Number(e.target.value))}
                  className="w-24 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#141414]"
                />
                <span className="font-mono text-xs font-bold w-12 text-right">{simulationDuration}m</span>
              </div>
            </div>
          </div>
          <div className="h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stressTestData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis 
                  dataKey="time" 
                  tickFormatter={(val) => {
                    const m = Math.floor(val / 60);
                    const s = val % 60;
                    return m > 0 ? (s === 0 ? `${m}m` : `${m}m ${s}s`) : `${s}s`;
                  }} 
                  stroke="#6b7280" 
                  fontSize={12} 
                  tickMargin={10}
                />
                <YAxis 
                  yAxisId="temp" 
                  domain={[30, 150]} 
                  stroke="#ea580c" 
                  fontSize={12}
                  tickFormatter={(val) => `${val}°C`}
                />
                <YAxis 
                  yAxisId="power" 
                  orientation="right" 
                  domain={[0, 60]} 
                  stroke="#0284c7" 
                  fontSize={12}
                  tickFormatter={(val) => `${val}W`}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#141414', color: '#fff', border: 'none', borderRadius: '4px' }}
                  itemStyle={{ fontSize: '12px', fontFamily: 'monospace' }}
                  labelStyle={{ fontSize: '12px', color: '#9ca3af', marginBottom: '4px' }}
                  formatter={(value: number, name: string) => {
                    if (name === 'temperature') return [`${value}°C`, 'CPU Temperature'];
                    if (name === 'vrmTemp') return [`${value}°C`, 'VRM Temperature'];
                    if (name === 'power') return [`${value}W`, 'Package Power'];
                    if (name === 'frequency') return [`${value}GHz`, 'Core Clock'];
                    return [value, name];
                  }}
                  labelFormatter={(label) => {
                    const m = Math.floor(Number(label) / 60);
                    const s = Number(label) % 60;
                    const timeStr = m > 0 ? `${m}m ${s}s` : `${s}s`;
                    return `Time: ${timeStr}`;
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px', fontFamily: 'monospace', paddingTop: '20px' }} />
                <Line 
                  yAxisId="temp" 
                  type="monotone" 
                  dataKey="temperature" 
                  name="temperature" 
                  stroke="#ea580c" 
                  strokeWidth={2} 
                  dot={false} 
                  isAnimationActive={false}
                />
                <Line 
                  yAxisId="temp" 
                  type="monotone" 
                  dataKey="vrmTemp" 
                  name="vrmTemp" 
                  stroke="#dc2626" 
                  strokeWidth={2} 
                  strokeDasharray="5 5"
                  dot={false} 
                  isAnimationActive={false}
                />
                <Line 
                  yAxisId="power" 
                  type="stepAfter" 
                  dataKey="power" 
                  name="power" 
                  stroke="#0284c7" 
                  strokeWidth={2} 
                  dot={false} 
                  isAnimationActive={false}
                />
                <Line 
                  yAxisId="power" 
                  type="monotone" 
                  dataKey="frequency" 
                  name="frequency" 
                  stroke="#8b5cf6" 
                  strokeWidth={2} 
                  dot={false} 
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
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
