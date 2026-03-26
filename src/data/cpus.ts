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
  {
    model: "Intel Core i7-8550U",
    architecture: "Kaby Lake-R",
    cores: 4,
    threads: 8,
    baseFreq: 1.8,
    maxTurbo: 4.0,
    allCoreTurbo: 3.7,
    tdp: 15,
    cache: "8MB",
    family: 6,
    stepping: 10,
    revisions: ["Y0"]
  },
  {
    model: "Intel Core i5-8350U",
    architecture: "Kaby Lake-R",
    cores: 4,
    threads: 8,
    baseFreq: 1.7,
    maxTurbo: 3.6,
    allCoreTurbo: 3.6,
    tdp: 15,
    cache: "6MB",
    family: 6,
    stepping: 10,
    revisions: ["Y0", "V0"]
  },
  {
    model: "Intel Core i5-8250U",
    architecture: "Kaby Lake-R",
    cores: 4,
    threads: 8,
    baseFreq: 1.6,
    maxTurbo: 3.4,
    allCoreTurbo: 3.4,
    tdp: 15,
    cache: "6MB",
    family: 6,
    stepping: 10,
    revisions: ["Y0"]
  },
  {
    model: "Intel Core i3-8130U",
    architecture: "Kaby Lake-R",
    cores: 2,
    threads: 4,
    baseFreq: 2.2,
    maxTurbo: 3.4,
    allCoreTurbo: 3.4,
    tdp: 15,
    cache: "4MB",
    family: 6,
    stepping: 10,
    revisions: ["Y0"]
  },

  // 7th Gen (Kaby Lake) - Stepping 9
  {
    model: "Intel Core i7-7660U",
    architecture: "Kaby Lake",
    cores: 2,
    threads: 4,
    baseFreq: 2.5,
    maxTurbo: 4.0,
    allCoreTurbo: 3.8,
    tdp: 15,
    cache: "4MB",
    family: 6,
    stepping: 9,
    revisions: ["H0"]
  },
  {
    model: "Intel Core i7-7600U",
    architecture: "Kaby Lake",
    cores: 2,
    threads: 4,
    baseFreq: 2.8,
    maxTurbo: 3.9,
    allCoreTurbo: 3.9,
    tdp: 15,
    cache: "4MB",
    family: 6,
    stepping: 9,
    revisions: ["H0", "J1"]
  },
  {
    model: "Intel Core i7-7567U",
    architecture: "Kaby Lake",
    cores: 2,
    threads: 4,
    baseFreq: 3.5,
    maxTurbo: 4.0,
    allCoreTurbo: 3.9,
    tdp: 28,
    cache: "4MB",
    family: 6,
    stepping: 9,
    revisions: ["H0"]
  },
  {
    model: "Intel Core i7-7500U",
    architecture: "Kaby Lake",
    cores: 2,
    threads: 4,
    baseFreq: 2.7,
    maxTurbo: 3.5,
    allCoreTurbo: 3.5,
    tdp: 15,
    cache: "4MB",
    family: 6,
    stepping: 9,
    revisions: ["H0", "B0"]
  },
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
  {
    model: "Intel Core i5-7267U",
    architecture: "Kaby Lake",
    cores: 2,
    threads: 4,
    baseFreq: 3.1,
    maxTurbo: 3.5,
    allCoreTurbo: 3.4,
    tdp: 28,
    cache: "4MB",
    family: 6,
    stepping: 9,
    revisions: ["H0"]
  },
  {
    model: "Intel Core i5-7200U",
    architecture: "Kaby Lake",
    cores: 2,
    threads: 4,
    baseFreq: 2.5,
    maxTurbo: 3.1,
    allCoreTurbo: 3.1,
    tdp: 15,
    cache: "3MB",
    family: 6,
    stepping: 9,
    revisions: ["H0", "B0"]
  },
  {
    model: "Intel Core i3-7100U",
    architecture: "Kaby Lake",
    cores: 2,
    threads: 4,
    baseFreq: 2.4,
    maxTurbo: 2.4,
    allCoreTurbo: 2.4,
    tdp: 15,
    cache: "3MB",
    family: 6,
    stepping: 9,
    revisions: ["H0", "S0"]
  },
  {
    model: "Intel Pentium 4415U",
    architecture: "Kaby Lake",
    cores: 2,
    threads: 4,
    baseFreq: 2.3,
    maxTurbo: 2.3,
    allCoreTurbo: 2.3,
    tdp: 15,
    cache: "2MB",
    family: 6,
    stepping: 9,
    revisions: ["H0"]
  },
  {
    model: "Intel Celeron 3965U",
    architecture: "Kaby Lake",
    cores: 2,
    threads: 2,
    baseFreq: 2.2,
    maxTurbo: 2.2,
    allCoreTurbo: 2.2,
    tdp: 15,
    cache: "2MB",
    family: 6,
    stepping: 9,
    revisions: ["H0"]
  },
  {
    model: "Intel Celeron 3865U",
    architecture: "Kaby Lake",
    cores: 2,
    threads: 2,
    baseFreq: 1.8,
    maxTurbo: 1.8,
    allCoreTurbo: 1.8,
    tdp: 15,
    cache: "2MB",
    family: 6,
    stepping: 9,
    revisions: ["H0"]
  },

  // 6th Gen (Skylake) - Stepping 3
  {
    model: "Intel Core i7-6600U",
    architecture: "Skylake",
    cores: 2,
    threads: 4,
    baseFreq: 2.6,
    maxTurbo: 3.4,
    allCoreTurbo: 3.2,
    tdp: 15,
    cache: "4MB",
    family: 6,
    stepping: 3,
    revisions: ["D0", "R0"]
  },
  {
    model: "Intel Core i7-6500U",
    architecture: "Skylake",
    cores: 2,
    threads: 4,
    baseFreq: 2.5,
    maxTurbo: 3.1,
    allCoreTurbo: 3.0,
    tdp: 15,
    cache: "4MB",
    family: 6,
    stepping: 3,
    revisions: ["D0"]
  },
  {
    model: "Intel Core i5-6300U",
    architecture: "Skylake",
    cores: 2,
    threads: 4,
    baseFreq: 2.4,
    maxTurbo: 3.0,
    allCoreTurbo: 2.9,
    tdp: 15,
    cache: "3MB",
    family: 6,
    stepping: 3,
    revisions: ["D0", "L1"]
  },
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
  },
  {
    model: "Intel Core i3-6100U",
    architecture: "Skylake",
    cores: 2,
    threads: 4,
    baseFreq: 2.3,
    maxTurbo: 2.3,
    allCoreTurbo: 2.3,
    tdp: 15,
    cache: "3MB",
    family: 6,
    stepping: 3,
    revisions: ["D0", "K1"]
  },
  {
    model: "Intel Pentium 4405U",
    architecture: "Skylake",
    cores: 2,
    threads: 4,
    baseFreq: 2.1,
    maxTurbo: 2.1,
    allCoreTurbo: 2.1,
    tdp: 15,
    cache: "2MB",
    family: 6,
    stepping: 3,
    revisions: ["D0"]
  },
  {
    model: "Intel Celeron 3955U",
    architecture: "Skylake",
    cores: 2,
    threads: 2,
    baseFreq: 2.0,
    maxTurbo: 2.0,
    allCoreTurbo: 2.0,
    tdp: 15,
    cache: "2MB",
    family: 6,
    stepping: 3,
    revisions: ["D0"]
  },
  {
    model: "Intel Celeron 3855U",
    architecture: "Skylake",
    cores: 2,
    threads: 2,
    baseFreq: 1.6,
    maxTurbo: 1.6,
    allCoreTurbo: 1.6,
    tdp: 15,
    cache: "2MB",
    family: 6,
    stepping: 3,
    revisions: ["D0"]
  }
];
