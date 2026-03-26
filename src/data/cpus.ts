export interface CpuSpecs {
  model: string;
  architecture: string;
  cores: number;
  threads: number;
  baseFreq: number; // GHz
  maxTurbo: number; // GHz
  allCoreTurbo: number; // GHz
  tdp: number; // Watts
  cache: string;
  family: number;
  stepping: number;
  revisions: string[];
}

export const BGA1356_CPUS: CpuSpecs[] = [
  // 8th Gen (Kaby Lake-R) - Stepping 10
  {
    model: "Intel Core i7-8650U",
    architecture: "Kaby Lake-R",
    cores: 4,
    threads: 8,
    baseFreq: 1.9,
    maxTurbo: 4.2,
    allCoreTurbo: 3.9,
    tdp: 15,
    cache: "8MB",
    family: 6,
    stepping: 10,
    revisions: ["Y0", "N0"]
  },

  // 7th Gen (Kaby Lake) - Stepping 9
  {
    model: "Intel Core i5-7300U",
    architecture: "Kaby Lake",
    cores: 2,
    threads: 4,
    baseFreq: 2.6,
    maxTurbo: 3.5,
    allCoreTurbo: 3.5,
    tdp: 15,
    cache: "3MB",
    family: 6,
    stepping: 9,
    revisions: ["H0"]
  },

  // 6th Gen (Skylake) - Stepping 3
  {
    model: "Intel Core i5-6200U",
    architecture: "Skylake",
    cores: 2,
    threads: 4,
    baseFreq: 2.3,
    maxTurbo: 2.8,
    allCoreTurbo: 2.7,
    tdp: 15,
    cache: "3MB",
    family: 6,
    stepping: 3,
    revisions: ["D0"]
  }
];
