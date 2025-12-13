import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Server, Database, CheckCircle, Info, HardDrive, 
  ArrowRight, ShieldCheck, AlertTriangle, Network, 
  Settings, Save, RefreshCw, XCircle, Box, Zap, Activity, Siren,
  Plus, Play, Power, Monitor, Layers, Globe, User, RotateCcw,
  RefreshCcw, Split, LayoutGrid, Hammer, Cpu, UploadCloud, Building, Briefcase
} from 'lucide-react';

// --- TIPOS ---
type AppPhase = 'INTRO' | 'CREATE_CLUSTER' | 'ADD_HOSTS' | 'CONFIG_VSAN' | 'OPERATION';
type VsanWizardStep = 'SERVICES' | 'CLAIM_DISKS' | 'REVIEW' | 'DEPLOYING';
type VSANHealth = 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'RESYNCING';
type LabScenario = 'STANDARD' | 'ROBO'; 
type StoragePolicy = 'RAID1_FTT1' | 'RAID5_FTT1' | 'RAID1_FTT2' | 'RAID6_FTT2' | 'RAID1_FTT3'; 
type VsanArchitecture = 'OSA' | 'ESA';

interface Disk {
  id: string;
  type: 'SSD' | 'HDD' | 'NVMe'; 
  tier: 'Cache' | 'Capacity' | 'StoragePool' | 'WitnessMetadata'; 
  claimedAs: 'Unclaimed' | 'Cache' | 'Capacity' | 'StoragePool' | 'Witness';
  status: 'Healthy' | 'Failed';
  size: string;
  capacityGB: number;
}

interface Host {
  id: string;
  name: string;
  ip: string;
  version: string;
  isWitness?: boolean;
  status: 'Connected' | 'Disconnected' | 'Maintenance' | 'Unmanaged'; 
  disks: Disk[];
  vmkConfigured: boolean;
  isolationStatus: 'Normal' | 'Isolated';
}

interface VMComponent {
  id: string;
  type: 'Data Replica' | 'Witness' | 'VM Home';
  hostId: string;
  status: 'Active' | 'Absent' | 'Stale';
}

interface VM {
  id: string;
  name: string;
  hostId: string;
  state: 'PoweredOn' | 'PoweredOff' | 'Booting';
  compliance: 'Compliant' | 'NonCompliant';
  policy: StoragePolicy;
  sizeGB: number;
  components: VMComponent[];
  usedSpaceGB: number; 
}

// --- CONFIGURACIÓN INICIAL ---
const INITIAL_VERSION = "ESXi 8.0 U2";
const TARGET_VERSION = "ESXi 8.0 U3";

// --- GENERADOR DE HOSTS (Fuera del componente) ---
const generateInitialHosts = (scenario: LabScenario, architecture: VsanArchitecture): Host[] => {
    const hostsArray: Host[] = [];
    
    if (scenario === 'STANDARD') {
        const numHosts = 7;
        for (let i = 1; i <= numHosts; i++) {
            const diskSetup = (i: number): Disk[] => {
                if (architecture === 'ESA') {
                    return [
                        { id: `nvme.500${i}1`, type: 'NVMe', size: '1.92 TB', capacityGB: 1920, tier: 'StoragePool', claimedAs: 'Unclaimed', status: 'Healthy' },
                        { id: `nvme.500${i}2`, type: 'NVMe', size: '1.92 TB', capacityGB: 1920, tier: 'StoragePool', claimedAs: 'Unclaimed', status: 'Healthy' },
                        { id: `nvme.500${i}3`, type: 'NVMe', size: '1.92 TB', capacityGB: 1920, tier: 'StoragePool', claimedAs: 'Unclaimed', status: 'Healthy' }
                    ];
                }
                return [
                    { id: `naa.500${i}`, type: 'SSD', size: '800 GB', capacityGB: 800, tier: 'Cache', claimedAs: 'Unclaimed', status: 'Healthy' },
                    { id: `naa.600${i}1`, type: 'HDD', size: '4 TB', capacityGB: 4000, tier: 'Capacity', claimedAs: 'Unclaimed', status: 'Healthy' },
                    { id: `naa.600${i}2`, type: 'HDD', size: '4 TB', capacityGB: 4000, tier: 'Capacity', claimedAs: 'Unclaimed', status: 'Healthy' }
                ];
            };

            hostsArray.push({
                id: `h${i}`, 
                name: `esxi0${i}.riveritatech.local`, 
                ip: `192.168.10.${10+i}`, 
                version: INITIAL_VERSION,
                status: 'Unmanaged', 
                vmkConfigured: false, 
                isolationStatus: 'Normal',
                disks: diskSetup(i)
            });
        }
    } else {
        // ROBO
        for (let i = 1; i <= 2; i++) {
             const diskSetup = (i: number): Disk[] => {
                if (architecture === 'ESA') {
                    return [
                        { id: `nvme.500${i}1`, type: 'NVMe', size: '3.84 TB', capacityGB: 3840, tier: 'StoragePool', claimedAs: 'Unclaimed', status: 'Healthy' },
                        { id: `nvme.500${i}2`, type: 'NVMe', size: '3.84 TB', capacityGB: 3840, tier: 'StoragePool', claimedAs: 'Unclaimed', status: 'Healthy' }
                    ];
                }
                return [
                    { id: `naa.500${i}`, type: 'SSD', size: '400 GB', capacityGB: 400, tier: 'Cache', claimedAs: 'Unclaimed', status: 'Healthy' },
                    { id: `naa.600${i}1`, type: 'HDD', size: '1.92 TB', capacityGB: 1920, tier: 'Capacity', claimedAs: 'Unclaimed', status: 'Healthy' }, 
                    { id: `naa.600${i}2`, type: 'HDD', size: '1.92 TB', capacityGB: 1920, tier: 'Capacity', claimedAs: 'Unclaimed', status: 'Healthy' }
                ];
            };
            hostsArray.push({
                id: `h${i}`, 
                name: `esxi0${i}-robo.riverita.local`, 
                ip: `10.10.10.${10+i}`, 
                version: INITIAL_VERSION,
                status: 'Unmanaged', 
                vmkConfigured: false, 
                isolationStatus: 'Normal',
                disks: diskSetup(i)
            });
        }
        // Witness
        hostsArray.push({
            id: `witness`,
            name: `vsan-witness-01.riverita.local`,
            ip: `172.16.20.5`,
            version: INITIAL_VERSION,
            isWitness: true,
            status: 'Unmanaged', 
            vmkConfigured: false,
            isolationStatus: 'Normal',
            disks: [
                { id: `wit.meta.1`, type: 'SSD', size: '10 GB', capacityGB: 0, tier: 'WitnessMetadata', claimedAs: 'Unclaimed', status: 'Healthy' }
            ]
        });
    }
    return hostsArray;
};

const RiveritatechVSANMasterLab = () => {
  // --- ESTADOS ---
  const [phase, setPhase] = useState<AppPhase>('INTRO');
  const [scenario, setScenario] = useState<LabScenario>('STANDARD'); 
  const [logs, setLogs] = useState<string[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const [clusterCreated, setClusterCreated] = useState(false);
  const [selectedHostsToAdd, setSelectedHostsToAdd] = useState<string[]>([]);
  const [vsanWizardStep, setVsanWizardStep] = useState<VsanWizardStep>('SERVICES');
  const [setupError, setSetupError] = useState<string | null>(null);
  const [maintenanceHostId, setMaintenanceHostId] = useState<string | null>(null);
  const [maintenanceProgress, setMaintenanceProgress] = useState(0);
  const [upgradingHostId, setUpgradingHostId] = useState<string | null>(null); 
  const [upgradeProgress, setUpgradeProgress] = useState(0); 
  const [architecture, setArchitecture] = useState<VsanArchitecture>('OSA'); 
  const [activeTab, setActiveTab] = useState<'SUMMARY' | 'MONITOR' | 'VMS'>('SUMMARY');
  const [vsanHealth, setVsanHealth] = useState<VSANHealth>('HEALTHY');
  const [resyncProgress, setResyncProgress] = useState(0);
  const [guideMode, setGuideMode] = useState(true);
  const [selectedPolicy, setSelectedPolicy] = useState<StoragePolicy>('RAID1_FTT1');
  const [selectedFailureHostId, setSelectedFailureHostId] = useState<string | null>(null); 
  const [selectedFailureDiskId, setSelectedFailureDiskId] = useState<string | null>(null); 
  const [hosts, setHosts] = useState<Host[]>([]);
  const [vms, setVms] = useState<VM[]>([]);

  useEffect(() => {
      if (hosts.length === 0) {
          setHosts(generateInitialHosts('STANDARD', 'OSA'));
      }
  }, []);

  // --- UTILS ---
  const addLog = (msg: string, isError = false) => {
    const time = new Date().toLocaleTimeString();
    setLogs(prev => [`[${time}] ${isError ? 'ERROR' : 'INFO'} | ${msg}`, ...prev]);
  };
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  useEffect(() => { logsEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [logs]);

  const calculateTotalCapacity = useCallback(() => {
    let totalGB = 0;
    hosts.forEach(h => {
      if ((h.status === 'Connected' || h.status === 'Maintenance') && !h.isWitness) { 
        h.disks.forEach(d => {
          if (d.claimedAs === 'Capacity' || d.claimedAs === 'StoragePool') {
            totalGB += d.capacityGB;
          }
        });
      }
    });
    return (totalGB / 1000).toFixed(1);
  }, [hosts]);

  const calculateUsedCapacity = useCallback(() => {
    let totalUsedGB = 0;
    vms.forEach(vm => { totalUsedGB += vm.usedSpaceGB; });
    return (totalUsedGB / 1000).toFixed(2);
  }, [vms]);

  // --- ACTIONS (LÓGICA) ---
  
  // Esta función debe estar definida ANTES de ser usada en renderIntro
  const selectScenario = (scen: LabScenario) => {
      setScenario(scen);
      setHosts(generateInitialHosts(scen, architecture));
      setPhase('CREATE_CLUSTER');
      addLog(`Iniciando laboratorio en modo: ${scen === 'STANDARD' ? 'Standard Cluster (7 Nodos)' : 'ROBO Cluster (2 Nodos + Witness)'}`);
  };

  const handleArchitectureChange = (newArchitecture: VsanArchitecture) => {
      setArchitecture(newArchitecture);
      setHosts(generateInitialHosts(scenario, newArchitecture).map(h => ({ 
        ...h, 
        status: h.status !== 'Unmanaged' ? 'Unmanaged' : h.status,
        vmkConfigured: false,
        isolationStatus: 'Normal',
        disks: h.disks.map(d => ({ ...d, claimedAs: 'Unclaimed', status: 'Healthy' }))
      })));
      setClusterCreated(false);
      setVms([]);
  };

  const resetLab = () => {
    setPhase('INTRO');
    setScenario('STANDARD'); 
    setClusterCreated(false);
    setSelectedHostsToAdd([]);
    setVsanWizardStep('SERVICES');
    setSetupError(null);
    setVsanHealth('HEALTHY');
    setVms([]);
    setLogs([]);
    setResyncProgress(0);
    setMaintenanceHostId(null);
    setMaintenanceProgress(0);
    setUpgradingHostId(null);
    setSelectedPolicy('RAID1_FTT1');
    setArchitecture('OSA'); 
    setHosts(generateInitialHosts('STANDARD', 'OSA')); 
  };

  const createCluster = () => {
      setClusterCreated(true);
      addLog(`Cluster 'ClusterLab' (${scenario} - ${architecture}) creado exitosamente.`);
      setTimeout(() => setPhase('ADD_HOSTS'), 1000);
  };

  const toggleHostSelection = (hostId: string) => {
      setSetupError(null); 
      setSelectedHostsToAdd(prev => 
          prev.includes(hostId) ? prev.filter(id => id !== hostId) : [...prev, hostId]
      );
  };

  const addSelectedHosts = async () => {
      const minHosts = scenario === 'STANDARD' ? 3 : 2;
      
      if (scenario === 'ROBO') {
          const hasWitness = selectedHostsToAdd.includes('witness');
          const dataHosts = selectedHostsToAdd.filter(id => id !== 'witness').length;
          if (!hasWitness || dataHosts < 2) {
              setSetupError("Error ROBO: Debes seleccionar los 2 nodos de datos Y el Witness Appliance.");
              return;
          }
      } else {
          if (selectedHostsToAdd.length < minHosts) {
              setSetupError(`Error Crítico: Se requiere un mínimo de ${minHosts} hosts.`);
              return;
          }
      }
      
      setSetupError(null);
      addLog(`Agregando ${selectedHostsToAdd.length} hosts al cluster...`);
      await delay(1500);
      
      setHosts(prev => prev.map(h => 
          selectedHostsToAdd.includes(h.id) ? { ...h, status: 'Connected' } : h
      ));
      
      addLog("Hosts conectados. Se requiere configuración vSAN.");
      setPhase('CONFIG_VSAN');
  };

  const toggleVmkConfig = (hostId: string) => {
      setHosts(prev => prev.map(h => 
          h.id === hostId ? { ...h, vmkConfigured: !h.vmkConfigured } : h
      ));
      setSetupError(null);
  };

  const claimDisk = (hostId: string, diskId: string, role: 'Cache' | 'Capacity' | 'StoragePool' | 'Witness') => {
      setHosts(prev => prev.map(h => {
          if (h.id === hostId) {
              const disk = h.disks.find(d => d.id === diskId);
              if (!disk) return h;

              if (h.isWitness) {
                  if (role !== 'Witness') return h; 
                  return { ...h, disks: h.disks.map(d => ({ ...d, claimedAs: d.claimedAs === 'Witness' ? 'Unclaimed' : 'Witness' }))};
              }

              let newClaimedAs: any = role;
              if (disk.claimedAs === role) newClaimedAs = 'Unclaimed';
              
              if (newClaimedAs !== 'Unclaimed') {
                  if (architecture === 'OSA' && role === 'Cache' && h.disks.some(d => d.id !== diskId && d.claimedAs === 'Cache')) {
                      setSetupError(`Error: El host ${h.name.split('.')[0]} ya tiene un disco de Caché asignado.`);
                      return h;
                  }
                  if (architecture === 'OSA' && role === 'Capacity' && disk.type === 'SSD') {
                      setSetupError(`Error: El SSD debe ser asignado como Caché en OSA.`);
                      return h;
                  }
                  if (architecture === 'ESA' && role === 'StoragePool' && disk.type === 'HDD') {
                    setSetupError(`Error: vSAN ESA requiere discos All-Flash (NVMe). Los HDD no son compatibles.`);
                    return h;
                  }
              }

              return {
                  ...h,
                  disks: h.disks.map(d => d.id === diskId ? { ...d, claimedAs: newClaimedAs } : d)
              };
          }
          return h;
      }));
      setSetupError(null);
  };

  const validateServicesAndProceed = () => {
      const activeHosts = hosts.filter(h => h.status === 'Connected');
      const unconfiguredHosts = activeHosts.filter(h => !h.vmkConfigured);
      if (unconfiguredHosts.length > 0) {
          setSetupError(`Error: Debes habilitar el tráfico vSAN en el VMkernel de todos los hosts. Faltan: ${unconfiguredHosts.map(h => h.name.split('.')[0]).join(', ')}`);
          return;
      }
      setSetupError(null);
      setVsanWizardStep('CLAIM_DISKS');
  };

  const validateDisksAndProceed = () => {
      if (scenario === 'ROBO') {
          const witness = hosts.find(h => h.isWitness);
          if (witness && witness.status === 'Connected' && !witness.disks.some(d => d.claimedAs === 'Witness')) {
              setSetupError("Error: Debes reclamar el disco de metadatos del Witness Appliance.");
              return;
          }
      }
      if (scenario === 'STANDARD') {
          const activeHosts = hosts.filter(h => h.status === 'Connected' && h.vmkConfigured);
          let allValid = true;
          if (architecture === 'OSA') {
              const invalidHosts = activeHosts.filter(h => {
                  const cacheDisks = h.disks.filter(d => d.claimedAs === 'Cache');
                  const capacityDisks = h.disks.filter(d => d.claimedAs === 'Capacity');
                  return cacheDisks.length !== 1 || capacityDisks.length === 0;
              });
              if (invalidHosts.length > 0) {
                  setSetupError(`Error OSA: Configuración incorrecta en: ${invalidHosts.map(h => h.name.split('.')[0]).join(', ')}`);
                  allValid = false;
              }
          } else if (architecture === 'ESA') {
              const invalidHosts = activeHosts.filter(h => {
                  const claimedDisks = h.disks.filter(d => d.claimedAs === 'StoragePool');
                  return claimedDisks.length < 2; 
              });
                if (invalidHosts.length > 0) {
                  setSetupError(`Error ESA: Mínimo 2 discos NVMe requeridos en: ${invalidHosts.map(h => h.name.split('.')[0]).join(', ')}`);
                  allValid = false;
              }
          }
          if (!allValid) return;
      }
      setSetupError(null);
      setVsanWizardStep('REVIEW');
  };

  const deployVSAN = async () => {
      setVsanWizardStep('DEPLOYING');
  };

  useEffect(() => {
    if (vsanWizardStep === 'DEPLOYING') {
      const deploy = async () => {
          await delay(3000);  
          setPhase('OPERATION');
          const totalCap = calculateTotalCapacity();
          addLog("Cluster vSAN configurado exitosamente. ");
          if (scenario === 'ROBO') addLog("Modo ROBO: 2 Nodos de Datos + 1 Witness Appliance configurado.");
          setVsanWizardStep('SERVICES'); 
      };
      deploy();   
    }
  }, [vsanWizardStep]);

  const upgradeHost = async (hostId: string) => {
      const host = hosts.find(h => h.id === hostId);
      if (!host || host.status !== 'Maintenance') {
          addLog("Error: El host debe estar en Modo Mantenimiento para actualizarse.", true);
          return;
      }
      setUpgradingHostId(hostId);
      setUpgradeProgress(0);
      addLog(`Lifecycle Manager: Iniciando actualización de ${host.name} a ${TARGET_VERSION}...`);
      for (let i = 0; i <= 100; i += 10) {
          await delay(300); 
          setUpgradeProgress(i);
          if (i === 30) addLog(`Remediando: Instalando imagen ${TARGET_VERSION}...`);
          if (i === 60) addLog(`Reiniciando host ${host.name.split('.')[0]}...`);
          if (i === 80) addLog(`Verificando conformidad de drivers...`);
      }
      setHosts(prev => prev.map(h => 
          h.id === hostId ? { ...h, version: TARGET_VERSION } : h
      ));
      addLog(`Éxito: Host ${host.name.split('.')[0]} actualizado correctamente a ${TARGET_VERSION}. Listo para salir de mantenimiento.`);
      setUpgradingHostId(null);
      setUpgradeProgress(0);
  };

  const addUnmanagedHost = (hostId: string) => {
      const templateDisks = generateInitialHosts(architecture === 'ESA' ? 'STANDARD' : 'STANDARD', architecture).find(gh => gh.id === hostId)?.disks || [];
      const defaultDisks = templateDisks.length > 0 ? templateDisks : generateInitialHosts('STANDARD', architecture)[0].disks;
      setHosts(prev => prev.map(h => 
          h.id === hostId ? { 
            ...h, 
            status: 'Connected', 
            vmkConfigured: false, 
            disks: defaultDisks.map(d => ({ ...d, claimedAs: 'Unclaimed', status: 'Healthy' })), 
          } : h
      ));
      const hostName = hosts.find(h => h.id === hostId)?.name.split('.')[0];
      addLog(`Host ${hostName} agregado al clúster para expansión. Configuración vSAN REQUERIDA.`);
      setActiveTab('MONITOR'); 
      setSetupError(`¡Expansión en progreso! Configura el tráfico vSAN y reclama los discos del host ${hostName} en esta pestaña.`);
  };

  // --- DRS & LOGIC ---
  const runDRS = useCallback(async () => {
      if (vms.length === 0) return;
      const connectedHosts = hosts.filter(h => 
        h.status === 'Connected' && 
        h.id !== maintenanceHostId && 
        !h.isWitness && 
        h.vmkConfigured && 
        h.disks.some(d => d.claimedAs !== 'Unclaimed')
      );
      if (connectedHosts.length < 2) return;
      const vmsByHost: { [key: string]: VM[] } = connectedHosts.reduce((acc, h) => {
          acc[h.id] = vms.filter(vm => vm.hostId === h.id);
          return acc;
      }, {} as { [key: string]: VM[] });
      const currentVmCounts = connectedHosts.map(h => ({ id: h.id, count: vmsByHost[h.id]?.length || 0 }));
      currentVmCounts.sort((a, b) => b.count - a.count); 
      const maxCount = currentVmCounts[0].count;
      const minCount = currentVmCounts[currentVmCounts.length - 1].count;
      if (maxCount > minCount + 1) { 
          addLog("DRS: Detectado desequilibrio de VMs. Iniciando vMotion automático (modo Aggressive)...");
          let movedCount = 0;
          const movedVms: VM[] = [];
          for (let i = 0; i < currentVmCounts.length; i++) {
            const sourceHost = currentVmCounts[i];
            while (sourceHost.count > minCount) {
                const targets = currentVmCounts.filter(h => h.count < sourceHost.count).sort((a, b) => a.count - b.count);
                const targetHost = targets[0];
                if (targetHost) {
                    const vmToMove = vmsByHost[sourceHost.id].pop();
                    if (vmToMove) {
                        movedVms.push({ ...vmToMove, hostId: targetHost.id });
                        targetHost.count++;
                        sourceHost.count--;
                        movedCount++;
                        const sourceHostName = hosts.find(h => h.id === sourceHost.id)?.name.split('.')[0];
                        const targetHostName = hosts.find(h => h.id === targetHost.id)?.name.split('.')[0];
                        addLog(`DRS: Migrando VM ${vmToMove.name} de ${sourceHostName} a ${targetHostName}...`);
                        currentVmCounts.sort((a, b) => b.count - a.count);
                        await delay(500);
                        const newMinCount = currentVmCounts[currentVmCounts.length - 1].count;
                        if (sourceHost.count <= newMinCount) break;
                    } else break;
                } else break;
            }
          }
          if (movedCount > 0) {
              setVms(prevVms => {
                  const remainingVms = prevVms.filter(vm => !movedVms.some(m => m.id === vm.id));
                  return [...remainingVms, ...movedVms];
              });
              addLog(`DRS: Reequilibrio de carga finalizado. ${movedCount} VMs migradas.`);
          }
      }
  }, [vms, hosts, maintenanceHostId]); 

  useEffect(() => {
    if (vsanHealth === 'HEALTHY' || (vsanHealth === 'RESYNCING' && resyncProgress === 100)) {
        const timer = setTimeout(() => { runDRS(); }, 3000); 
        return () => clearTimeout(timer);
    }
    const newlyConnectedHost = hosts.find(h => h.status === 'Connected' && h.vmkConfigured && h.disks.some(d => d.claimedAs !== 'Unclaimed') && h.id === `h${7}`);
    if (newlyConnectedHost && vms.length > 0) {
         const timer = setTimeout(() => { runDRS(); }, 3000); 
        return () => clearTimeout(timer);
    }
  }, [vsanHealth, resyncProgress, hosts, vms.length, runDRS]);

  const generateVMComponents = (vmId: string, policy: StoragePolicy, activeHosts: Host[]): VMComponent[] => {
    if (scenario === 'ROBO') {
        const h1 = activeHosts.find(h => !h.isWitness && h.id.includes('1'));
        const h2 = activeHosts.find(h => !h.isWitness && h.id.includes('2'));
        const wit = activeHosts.find(h => h.isWitness);
        if (!h1 || !h2 || !wit) return [];
        return [
            { id: `${vmId}-home`, type: 'VM Home', hostId: h1.id, status: 'Active' },
            { id: `${vmId}-data-1`, type: 'Data Replica', hostId: h1.id, status: 'Active' },
            { id: `${vmId}-data-2`, type: 'Data Replica', hostId: h2.id, status: 'Active' },
            { id: `${vmId}-witness`, type: 'Witness', hostId: wit.id, status: 'Active' }
        ];
    }
    const numHosts = activeHosts.length;
    if (numHosts < 3) return [];
    
    const components: VMComponent[] = [];
    const hostIds = activeHosts.map(h => h.id);
    const hostIndex = parseInt(vmId.replace('vm', ''), 10);
    const getHostId = (offset: number) => hostIds[(hostIndex + offset) % numHosts];
    components.push({ id: `${vmId}-home`, type: 'VM Home', hostId: hostIds[0], status: 'Active' });
    
    if (policy.includes('FTT3') && numHosts >= 7) {
        components.push({ id: `${vmId}-d1`, type: 'Data Replica', hostId: getHostId(1), status: 'Active' });
        components.push({ id: `${vmId}-d2`, type: 'Data Replica', hostId: getHostId(2), status: 'Active' });
        components.push({ id: `${vmId}-d3`, type: 'Data Replica', hostId: getHostId(3), status: 'Active' });
        components.push({ id: `${vmId}-d4`, type: 'Data Replica', hostId: getHostId(4), status: 'Active' });
        components.push({ id: `${vmId}-w1`, type: 'Witness', hostId: getHostId(5), status: 'Active' });
        components.push({ id: `${vmId}-w2`, type: 'Witness', hostId: getHostId(6), status: 'Active' });
        components.push({ id: `${vmId}-w3`, type: 'Witness', hostId: getHostId(0), status: 'Active' }); 
    } else {
        components.push({ id: `${vmId}-d1`, type: 'Data Replica', hostId: getHostId(1), status: 'Active' });
        components.push({ id: `${vmId}-d2`, type: 'Data Replica', hostId: getHostId(2), status: 'Active' });
        components.push({ id: `${vmId}-w1`, type: 'Witness', hostId: getHostId(3), status: 'Active' });
    }
    return components;
  };

  const createVMs = () => {
      setSetupError(null);
      const activeHosts = hosts.filter(h => h.status === 'Connected' && h.vmkConfigured);
      if (scenario === 'ROBO') {
          if (activeHosts.length < 3) { 
              setSetupError("Se necesitan los 2 nodos y el Witness conectados.");
              return;
          }
      } else {
          if (activeHosts.length < 3) {
              setSetupError("Se necesitan al menos 3 hosts.");
              return;
          }
      }
      const NUM_VMS_TO_CREATE = 12;
      const VM_SIZES_GB = [50, 50, 100, 100, 200, 200, 500, 500, 100, 200, 50, 500];
      const newVms: VM[] = [];
      let consumptionMultiplier = 0;
      if (selectedPolicy.includes('RAID1')) {
          const ftt = parseInt(selectedPolicy.split('FTT')[1], 10);
          consumptionMultiplier = ftt + 1; 
      } else if (selectedPolicy === 'RAID5_FTT1') {
          consumptionMultiplier = 1.33; 
      } else if (selectedPolicy === 'RAID6_FTT2') {
          consumptionMultiplier = 1.5; 
      }
      for (let i=0; i<NUM_VMS_TO_CREATE; i++) {
          const vmId = `vm${i+1}`;
          const computeHosts = activeHosts.filter(h => !h.isWitness);
          if (computeHosts.length === 0) break;
          const hostIndex = i % computeHosts.length;
          const hostId = computeHosts[hostIndex].id;
          const sizeGB = VM_SIZES_GB[i];
          newVms.push({
              id: vmId,
              name: `App-Server-${String(i+1).padStart(2,'0')}`,
              hostId: hostId,
              state: 'PoweredOn',
              compliance: 'Compliant',
              policy: selectedPolicy,
              sizeGB: sizeGB,
              components: generateVMComponents(vmId, selectedPolicy, activeHosts),
              usedSpaceGB: Math.ceil(sizeGB * consumptionMultiplier)
          });
      }
      setVms(newVms);
      addLog(`${NUM_VMS_TO_CREATE} VMs desplegadas.`);
      runDRS();
  };

  const enterMaintenanceMode = async (hostId: string, mode: 'EnsureAccessibility' | 'FullDataEvacuation') => {
      const host = hosts.find(h => h.id === hostId);
      if (!host) return;
      if (host.isWitness) {
          addLog(`Witness Appliance ${host.name} entrando en mantenimiento. No se requiere evacuación de datos.`);
          setHosts(prev => prev.map(h => h.id === hostId ? { ...h, status: 'Maintenance' } : h));
          setVsanHealth('WARNING'); 
          addLog("Cluster en estado WARNING: Redundancia de testigos reducida.");
          return;
      }
      const activeHosts = hosts.filter(h => h.status === 'Connected' && h.id !== hostId && !h.isWitness);
      if (activeHosts.length === 0) {
          setSetupError("Error: No hay hosts disponibles para evacuar las VMs (Compute).");
          return;
      }
      setMaintenanceHostId(hostId);
      setMaintenanceProgress(0);
      setResyncProgress(0);
      setVsanHealth('RESYNCING');
      addLog(`Host ${host.name.split('.')[0]} entrando en Modo Mantenimiento... Iniciando evacuación de Compute (vMotion).`);
      let nextHostIndex = 0;
      setVms(prevVms => prevVms.map(vm => {
          if (vm.hostId === hostId) {
              const newHostId = activeHosts[nextHostIndex % activeHosts.length].id;
              nextHostIndex++;
              addLog(`vMotion: Migrando ${vm.name} de ${hosts.find(h => h.id === hostId)?.name.split('.')[0]} a ${hosts.find(h => h.id === newHostId)?.name.split('.')[0]}.`);
              return { ...vm, hostId: newHostId, compliance: 'Compliant' };
          }
          return vm;
      }));
      await delay(1500);
      if (mode === 'FullDataEvacuation') {
          addLog("Iniciando evacuación completa de DATOS (Full Data Evacuation)...");
          for(let i=0; i<=100; i+=20) {
              await delay(500);
              setMaintenanceProgress(i);
          }
          addLog("Evacuación de Datos y Compute Finalizada. Host seguro para mantenimiento.");
      } else {
          addLog("Modo Asegurar Accesibilidad: Datos NO movidos (FTT reducido temporalmente). Compute evacuado.");
          setVms(prevVms => prevVms.map(vm => {
              if (vm.components.some(c => c.hostId === hostId)) {
                  return { ...vm, compliance: 'NonCompliant' };
              }
              return vm;
          }));
      }
      setHosts(prev => prev.map(h => h.id === hostId ? { ...h, status: 'Maintenance' } : h));
      setMaintenanceHostId(null);
      setVsanHealth('WARNING'); 
  };

  const simulateFailure = (type: 'HOST' | 'DISK' | 'NETWORK', id: string) => {
    setSelectedFailureHostId(null);
    setSelectedFailureDiskId(null);
    if (vms.length === 0) {
      addLog('No hay VMs para simular fallas. Despliega VMs primero.', true);
      return;
    }
    const currentFTT = parseInt(selectedPolicy.split('FTT')[1] || '1', 10);
    const failedHostsOrMaintenance = hosts.filter(h => h.status === 'Disconnected' || h.isolationStatus === 'Isolated' || h.status === 'Maintenance').length;
    const isHostFailure = type === 'HOST' || type === 'NETWORK';
    const totalFailures = failedHostsOrMaintenance + (isHostFailure ? 1 : 0);
    if (scenario !== 'ROBO' && isHostFailure && totalFailures > currentFTT) {
        addLog(`Error Crítico: La falla del host ${hosts.find(h => h.id === id)?.name.split('.')[0]} excedería la tolerancia FTT=${currentFTT}. Falla bloqueada.`, true);
        return;
    }
    if (type === 'HOST' || type === 'NETWORK') {
      const hostToFail = hosts.find(h => h.id === id);
      const connectedHosts = hosts.filter(h => h.status === 'Connected' && h.id !== id);
      if (!hostToFail || hostToFail.status !== 'Connected' || connectedHosts.length < 2) { 
        if (scenario === 'ROBO' && connectedHosts.length >= 1) {
             // OK
        } else {
            addLog('Error: Mínimo de hosts activos no cumplido.', true);
            return;
        }
      }
      setVsanHealth('CRITICAL');
      if (type === 'HOST') {
        setHosts(prev => prev.map(h => h.id === id ? { ...h, status: 'Disconnected' } : h));
        addLog(`Falla simulada: Host ${hostToFail.name} ha perdido la conectividad. Estado: CRÍTICAL.`, true);
      } else if (type === 'NETWORK') {
        setHosts(prev => prev.map(h => h.id === id ? { ...h, isolationStatus: 'Isolated', status: 'Disconnected' } : h));
        addLog(`Partición de Red Simulada: Host ${hostToFail.name} ha perdido el Quorum vSAN (aislamiento de red). Estado: CRÍTICAL.`, true);
      }
      // CORRECCIÓN CRÍTICA: Excluir Witness de los hosts sobrevivientes para reiniciar VMs
      const survivingHostIds = hosts.filter(h => h.status === 'Connected' && h.id !== id && !h.isWitness).map(h => h.id);
      let nextHostIndex = 0;
      setVms(prevVms => {
          return prevVms.map(vm => {
              if (vm.hostId === id) {
                  if (survivingHostIds.length === 0) {
                      return { ...vm, state: 'PoweredOff', compliance: 'NonCompliant' };
                  }
                  const newHostId = survivingHostIds[nextHostIndex % survivingHostIds.length];
                  nextHostIndex++;
                  addLog(`vSphere HA: Reiniciando VM ${vm.name} en el host ${hosts.find(h => h.id === newHostId)?.name.split('.')[0] || 'Desconocido'}.`, false);
                  return { ...vm, hostId: newHostId, state: 'PoweredOn', compliance: 'NonCompliant' };
              }
              if (vm.components.some(c => c.hostId === id)) {
                return { ...vm, compliance: 'NonCompliant' };
              }
              return vm;
          });
      });
      addLog("vSAN inicia la reconstrucción de los componentes de las VMs afectadas. ");
    } else if (type === 'DISK') {
        const targetHost = hosts.find(h => h.disks.some(d => d.id === id));
        const diskToFail = targetHost?.disks.find(d => d.id === id);
        if (!diskToFail || !targetHost || diskToFail.status !== 'Healthy' || targetHost.status !== 'Connected') {
             addLog('Error: El disco ya está en estado de falla, el host está desconectado o el disco no existe.', true);
             return;
        }
        let shouldFailHost = false;
        if (architecture === 'OSA' && diskToFail.claimedAs === 'Cache') {
            shouldFailHost = true;
            addLog(`Falla Crítica simulada: Disco de Caché ${diskToFail.id} ha fallado. Pérdida total del Disk Group. Estado: CRÍTICAL.`, true);
        } else if (architecture === 'ESA' && diskToFail.claimedAs === 'StoragePool') {
            setHosts(prev => prev.map(h => 
              h.id === targetHost.id
                  ? { ...h, disks: h.disks.map(d => d.id === id ? { ...d, status: 'Failed' } : d) }
                  : h
            ));
            addLog(`Falla simulada: Disco ${diskToFail.id} en ${targetHost.name} ha fallado (ESA). Estado: WARNING.`, true);
            setVsanHealth('WARNING');
        } else if (architecture === 'OSA' && diskToFail.claimedAs === 'Capacity') {
            setHosts(prev => prev.map(h => 
              h.id === targetHost.id 
                  ? { ...h, disks: h.disks.map(d => d.id === id ? { ...d, status: 'Failed' } : d) }
                  : h
            ));
            addLog(`Falla simulada: Disco de Capacidad ${diskToFail.id} en ${targetHost.name} ha fallado. VMs activas. Estado: WARNING.`, true);
            setVsanHealth('WARNING');
        }
        if (shouldFailHost) {
            const connectedHosts = hosts.filter(h => h.status === 'Connected' && h.id !== targetHost.id);
            let nextHostIndex = 0;
            const survivingHostIds = connectedHosts.map(h => h.id);
            setHosts(prev => prev.map(h => 
              h.id === targetHost.id 
                  ? { ...h, status: 'Disconnected', disks: h.disks.map(d => ({ ...d, status: 'Failed' })) }
                  : h
            ));
            setVms(prevVms => prevVms.map(vm => {
                if (vm.hostId === targetHost.id) {
                    const newHostId = survivingHostIds[nextHostIndex % survivingHostIds.length];
                    nextHostIndex++;
                    addLog(`vSphere HA (por fallo de Disco): Reiniciando VM ${vm.name} en host ${hosts.find(h => h.id === newHostId)?.name.split('.')[0] || 'Desconocido'}.`, false);
                    return { ...vm, hostId: newHostId, state: 'PoweredOn', compliance: 'NonCompliant' };
                }
                if (vm.components.some(c => c.hostId === targetHost.id)) {
                  return { ...vm, compliance: 'NonCompliant' };
                }
                return vm;
            }));
        } else {
             setVms(prev => prev.map(vm => vm.hostId === targetHost.id ? { ...vm, compliance: 'NonCompliant' } : vm));
        }
    }
  };

  const simulateRecovery = async (id: string, type: 'HOST' | 'DISK' | 'NETWORK') => {
    if (vsanHealth === 'RESYNCING') {
          addLog('La resincronización ya está en curso. Espere a que finalice.', true);
          return;
    }
    const hostToRecover = hosts.find(h => h.id === id);
    const diskToRecover = hosts.flatMap(h => h.disks).find(d => d.id === id);
    if (type === 'HOST' && hostToRecover?.status === 'Connected' && hostToRecover?.isolationStatus === 'Normal') return;
    if (type === 'NETWORK' && hostToRecover?.isolationStatus === 'Normal') return;
    if (type === 'DISK' && diskToRecover?.status === 'Healthy' && hosts.find(h => h.disks.some(d => d.id === id))?.status === 'Connected') return;
    setVsanHealth('RESYNCING');
    setResyncProgress(0);
    const targetName = type === 'HOST' || type === 'NETWORK' ? hostToRecover?.name.split('.')[0] : diskToRecover?.id;
    addLog(`Recuperación iniciada para ${type === 'HOST' ? 'Host' : type === 'NETWORK' ? 'Red' : 'Disco'} ${targetName}. Iniciando resincronización de vSAN...`);
    if (type === 'HOST' || type === 'NETWORK') {
        setHosts(prev => prev.map(h => h.id === id ? { ...h, status: 'Connected', isolationStatus: 'Normal' } : h));
        if (type === 'NETWORK') addLog(`Host ${targetName} reintegrado a la red vSAN. Quorum restaurado.`, false);
    } else if (type === 'DISK') {
        const host = hosts.find(h => h.disks.some(d => d.id === id));
        if (host) {
            setHosts(prev => prev.map(h => 
                h.id === host.id 
                    ? { 
                        ...h, 
                        status: 'Connected', 
                        disks: h.disks.map(d => 
                          (d.id === id || (h.status === 'Disconnected' && d.claimedAs !== 'Unclaimed')) 
                            ? { ...d, status: 'Healthy' } 
                            : d
                        ) 
                    }
                    : h
            ));
        }
        addLog(`Disco ${diskToRecover?.id} simulado como reemplazado exitosamente.`, false);
    }
    for (let i = 0; i <= 100; i += 10) {
      await delay(400);
      setResyncProgress(i);
      if (i % 20 === 0) {
        addLog(`Resincronización de componentes: ${i}% completada.`, false);
      }
    }
    setResyncProgress(100);
    setVsanHealth('HEALTHY');
    setVms(prev => prev.map(vm => ({ ...vm, compliance: 'Compliant' })));
    addLog("Resincronización de vSAN completada. Todos los objetos cumplen con la política (Compliant). Estado: HEALTHY.");
  };

  const exitMaintenanceMode = async (hostId: string) => {
    addLog(`Host ${hosts.find(h => h.id === hostId)?.name.split('.')[0]} saliendo del Modo Mantenimiento. Iniciando resincronización.`);
    setHosts(prev => prev.map(h => h.id === hostId ? { ...h, status: 'Connected' } : h));
    simulateRecovery(hostId, 'HOST'); 
  };

  // --- RENDERIZADORES ---
  const renderTooltip = (text: string) => guideMode && (
    <span className="relative group ml-1 text-blue-500 cursor-help" title={text}>
      <Info size={14} className="inline"/>
    </span>
  );

  const renderHealthIcon = (health: VSANHealth, size: number) => {
      switch (health) {
          case 'HEALTHY': return <CheckCircle size={size} className="text-green-600"/>;
          case 'CRITICAL': return <XCircle size={size} className="text-red-600 animate-pulse"/>;
          case 'WARNING': return <AlertTriangle size={size} className="text-orange-600"/>;
          case 'RESYNCING': return <RefreshCw size={size} className="text-blue-600 animate-spin"/>;
          default: return <Info size={size} className="text-gray-500"/>;
      }
  }

  // --- RENDERIZADORES PRINCIPALES ---

  const renderSidebar = () => {
    const hostsInCluster = hosts.filter(h => h.status !== 'Unmanaged');
    const unmanagedHosts = hosts.filter(h => h.status === 'Unmanaged');
    return (
      <div className="w-[260px] bg-white border-r border-gray-300 flex flex-col shrink-0">
          <div className="p-3 bg-[#f1f3f5] border-b text-[11px] font-bold text-gray-600 uppercase flex justify-between items-center">
              Inventario
              <button onClick={() => setGuideMode(prev => !prev)} className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${guideMode ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'}`} title={guideMode ? 'Desactivar Guía' : 'Activar Guía Educativa'}>{guideMode ? 'Guía ON' : 'Guía OFF'}</button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 text-[13px] space-y-1">
              <div className="flex items-center gap-1"><Globe size={14} className="text-gray-500"/> Riveritatech Datacenter</div>
              {unmanagedHosts.length > 0 && phase === 'OPERATION' && (
                  <div className="ml-4 space-y-1 mt-2 p-1 bg-gray-100 rounded-xl text-xs border border-gray-200">
                      <div className="font-bold text-gray-700 flex items-center gap-1 p-1"><Plus size={14}/> Hosts de Reserva</div>
                      {unmanagedHosts.map(h => (
                          <div key={h.id} className="flex justify-between items-center ml-2 bg-white p-1 rounded-lg border">
                              <span className="text-gray-500 flex items-center gap-1">{h.isWitness ? <Box size={12}/> : <Server size={12}/>} {h.name.split('.')[0]}</span>
                              <button onClick={() => addUnmanagedHost(h.id)} className="text-blue-500 text-[10px] px-2 py-0.5 rounded-full border border-blue-400 bg-blue-50 hover:bg-blue-100">Añadir al Clúster</button>
                          </div>
                      ))}
                  </div>
              )}
              {clusterCreated && (
                  <div className="ml-4 font-bold text-[#007cbb] bg-blue-50 p-2 rounded-xl border border-blue-200">
                      <Layers size={14} className="inline mr-1"/> ClusterLab {renderTooltip("Un clúster es un conjunto de hosts que trabajan juntos compartiendo recursos y almacenamiento (vSAN).")}
                      <div className="ml-4 space-y-2 mt-2">
                              {hostsInCluster.map(h => (
                                  <div key={h.id} className="flex flex-col text-gray-700 font-medium">
                                      <div className="flex items-center gap-1">
                                          {h.isWitness ? <Box size={14} className="text-purple-600"/> : <Server size={14} className={h.status === 'Connected' ? 'text-gray-600' : 'text-red-500'}/>}
                                          <span className={`text-sm ${h.status === 'Disconnected' ? 'text-red-600 italic font-bold' : ''}`}>{h.name.split('.')[0]}</span>
                                          {h.status === 'Maintenance' && <Hammer size={12} className="text-yellow-600 ml-1" title="Modo Mantenimiento"/>}
                                          {h.isolationStatus === 'Isolated' && <Split size={12} className="text-purple-600 ml-1" title="Aislamiento de Red"/>}
                                      </div>
                                      {vms.filter(vm => vm.hostId === h.id).map(vm => (
                                          <div key={vm.id} className="ml-4 flex items-center gap-1 text-gray-500 text-xs"><Monitor size={12}/> {vm.name}</div>
                                      ))}
                                  </div>
                              ))}
                        </div>
                  </div>
              )}
              {phase === 'OPERATION' && (<div className="ml-8 text-gray-500 mt-2 flex items-center gap-1 font-medium text-sm"><Database size={14}/> vsanDatastore {renderTooltip("El vSAN Datastore es el almacenamiento lógico unificado que agrupa todos los discos de capacidad de los hosts del clúster.")}</div>)}
          </div>
      </div>
    );
  };

  const renderIntro = () => (
      <div className="flex flex-col items-center justify-center h-full p-10 text-center animate-in fade-in bg-gradient-to-br from-gray-100 to-gray-200">
          <div className="bg-[#007cbb] p-6 rounded-full text-white mb-6 shadow-2xl"><Database size={64} /></div>
          <h1 className="text-4xl font-extrabold text-gray-800 mb-2">vSAN</h1>
          <p className="text-gray-500 mb-8">Simulador Avanzado de Arquitecturas vSAN 8 (ESA/OSA)</p>
          <div className="grid grid-cols-2 gap-6 w-full max-w-4xl">
              <div onClick={() => selectScenario('STANDARD')} className="bg-white p-8 rounded-2xl shadow-xl border-2 border-transparent hover:border-[#007cbb] cursor-pointer transition-all hover:scale-105 flex flex-col items-center group">
                  <div className="bg-blue-50 p-4 rounded-full mb-4 group-hover:bg-blue-100"><Building size={48} className="text-[#007cbb]"/></div>
                  <h3 className="text-xl font-bold text-gray-800 mb-2">Corporate Data Center</h3>
                  <p className="text-sm text-gray-500 mb-4">Cluster Estándar (7 Nodos)</p>
                  <ul className="text-left text-xs text-gray-600 space-y-2 mb-4 bg-gray-50 p-3 rounded-lg w-full"><li>✅ RAID-1, RAID-5, RAID-6</li><li>✅ Alta Redundancia (FTT=3)</li><li>✅ Dedicado a alto rendimiento</li></ul>
                  <span className="text-[#007cbb] font-bold text-sm">Seleccionar &rarr;</span>
              </div>
              <div onClick={() => selectScenario('ROBO')} className="bg-white p-8 rounded-2xl shadow-xl border-2 border-transparent hover:border-purple-500 cursor-pointer transition-all hover:scale-105 flex flex-col items-center group">
                  <div className="bg-purple-50 p-4 rounded-full mb-4 group-hover:bg-purple-100"><Briefcase size={48} className="text-purple-600"/></div>
                  <h3 className="text-xl font-bold text-gray-800 mb-2">Remote Office / Branch (ROBO)</h3>
                  <p className="text-sm text-gray-500 mb-4">2-Node Cluster + Witness</p>
                  <ul className="text-left text-xs text-gray-600 space-y-2 mb-4 bg-gray-50 p-3 rounded-lg w-full"><li>✅ Costo optimizado (2 hosts)</li><li>✅ Witness Appliance Externo</li><li>✅ Ideal para Edge/Sucursales</li></ul>
                  <span className="text-purple-600 font-bold text-sm">Seleccionar &rarr;</span>
              </div>
          </div>
      </div>
  );

  const renderCreateCluster = () => (
      <div className="p-10 flex flex-col items-center">
          <h2 className="text-2xl font-bold text-gray-700 mb-6">Paso 1: Crear Clúster ({scenario})</h2>
          <div className="bg-white p-8 rounded-xl shadow-2xl border border-gray-100 w-[600px]">
              <h3 className="font-bold text-lg text-gray-800 mb-4 border-b pb-2">1. Arquitectura de vSAN 8 </h3>
               <div className="flex space-x-4 mb-6">
                    <label className={`flex items-start gap-3 p-4 border rounded-xl cursor-pointer transition-colors w-1/2 shadow-sm ${architecture === 'OSA' ? 'bg-blue-100 border-blue-400' : 'bg-white border-gray-300'}`} onClick={() => handleArchitectureChange('OSA')}>
                        <input type="radio" name="architecture" checked={architecture === 'OSA'} onChange={() => handleArchitectureChange('OSA')} className="accent-[#007cbb] mt-1"/>
                        <div><div className="font-bold flex items-center">vSAN OSA (Original) <Box size={14} className="ml-2"/></div><div className="text-xs text-gray-600">Requiere discos dedicados para **Caché (SSD)** y **Capacidad (HDD/HDD)**.</div></div>
                    </label>
                    <label className={`flex items-start gap-3 p-4 border rounded-xl cursor-pointer transition-colors w-1/2 shadow-sm ${architecture === 'ESA' ? 'bg-green-100 border-green-400' : 'bg-white border-gray-300'}`} onClick={() => handleArchitectureChange('ESA')}>
                        <input type="radio" name="architecture" checked={architecture === 'ESA'} onChange={() => handleArchitectureChange('ESA')} className="accent-[#007cbb] mt-1"/>
                        <div><div className="font-bold flex items-center">vSAN ESA (Express) <Zap size={14} className="ml-2"/></div><div className="text-xs text-gray-600">Simplificado: Utiliza **todos los discos como Storage Pool** (NVMe).</div></div>
                    </label>
                </div>
              <h3 className="font-bold text-lg text-gray-800 mb-4 border-b pb-2">2. Configuración del Clúster</h3>
              <div className="mb-4"><label className="block text-sm font-bold text-gray-700 mb-2">Nombre del Clúster</label><input type="text" value="ClusterLab" disabled className="w-full p-3 border rounded-lg bg-gray-50 text-gray-600"/></div>
              <div className="mb-6 space-y-3 p-4 bg-gray-50 rounded-xl border border-gray-200">
                  <div className="flex items-center gap-2"><input type="checkbox" checked readOnly className="accent-blue-600 w-4 h-4"/> <span className="text-sm">Activar vSphere DRS</span></div>
                  <div className="flex items-center gap-2"><input type="checkbox" checked readOnly className="accent-blue-600 w-4 h-4"/> <span className="text-sm">Activar vSphere HA</span></div>
                  <div className="flex items-center gap-2"><input type="checkbox" checked readOnly className="accent-blue-600 w-4 h-4"/> <span className="text-sm font-bold text-[#007cbb]"><Database size={14} className="inline mr-1"/> Activar vSAN</span></div>
              </div>
              <div className="flex justify-end"><button onClick={createCluster} className="px-6 py-2 bg-[#007cbb] text-white rounded-lg font-bold hover:bg-[#005a8a] transition-colors shadow-md">Crear</button></div>
          </div>
      </div>
  );

  const renderAddHosts = () => (
      <div className="p-10 max-w-4xl mx-auto w-full">
          <h2 className="text-2xl font-bold text-gray-700 mb-2">Paso 2: Agregar Hosts al Clúster</h2>
          <p className="text-gray-500 mb-6">Selecciona los hosts descubiertos en el datacenter para agregarlos a 'ClusterLab'.</p>
          <div className="bg-white border rounded-xl shadow-lg overflow-hidden mb-6">
              <table className="w-full text-left text-sm">
                  <thead className="bg-gray-100 border-b"><tr><th className="p-3 w-10"></th><th className="p-3">Host</th><th className="p-3">Versión</th><th className="p-3">Discos Disponibles</th><th className="p-3">Estado</th></tr></thead>
                  <tbody>{hosts.map(h => (<tr key={h.id} className="border-b hover:bg-gray-50 transition-colors"><td className="p-3"><input type="checkbox" checked={selectedHostsToAdd.includes(h.id)} onChange={() => toggleHostSelection(h.id)} className="accent-blue-600 w-4 h-4"/></td><td className="p-3 font-medium flex items-center gap-2">{h.isWitness ? <Box size={14} className="text-purple-600"/> : <Server size={14} className="text-gray-500"/>} {h.name}</td><td className="p-3 text-gray-600">{h.version}</td><td className="p-3 text-xs text-gray-500">{h.disks.filter(d => d.type === 'SSD' || d.type === 'NVMe').length} SSD/NVMe / {h.disks.filter(d => d.type === 'HDD').length} HDD</td><td className="p-3"><span className="text-green-600 font-medium">Listo</span></td></tr>))}</tbody>
              </table>
          </div>
          {setupError && (<div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg mb-4 flex items-center gap-2 animate-pulse shadow-sm"><XCircle size={20}/> {setupError}</div>)}
          <div className="flex justify-end"><button onClick={addSelectedHosts} className="px-6 py-2 bg-[#007cbb] text-white rounded-lg font-bold hover:bg-[#005a8a] disabled:opacity-50 transition-colors shadow-md">Agregar al Clúster ({selectedHostsToAdd.length} hosts)</button></div>
      </div>
  );

  const renderConfigVSAN = () => (
      <div className="p-4 h-full flex flex-col w-full overflow-hidden">
          <h2 className="text-2xl font-bold text-gray-700 mb-4 shrink-0">Paso 3: Configurar vSAN ({architecture} - {architecture === 'OSA' ? 'Original' : 'Express'})</h2>
          {setupError && (<div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg mb-4 flex items-center gap-2 animate-pulse shrink-0 shadow-sm"><XCircle size={20}/> {setupError}</div>)}
          <div className="flex-1 bg-white border border-gray-300 rounded-xl shadow-lg flex flex-col overflow-hidden">
              <div className="flex border-b shrink-0 bg-gray-50">
                  <div className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors ${vsanWizardStep === 'SERVICES' ? 'border-[#007cbb] text-[#007cbb]' : 'border-transparent text-gray-500'}`}>1. Servicios (VMkernel)</div>
                  <div className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors ${vsanWizardStep === 'CLAIM_DISKS' ? 'border-[#007cbb] text-[#007cbb]' : 'border-transparent text-gray-500'}`}>2. Reclamar Discos</div>
                  <div className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors ${vsanWizardStep === 'REVIEW' ? 'border-[#007cbb] text-[#007cbb]' : 'border-transparent text-gray-500'}`}>3. Revisar y Desplegar</div>
              </div>
              <div className="p-6 flex-1 overflow-y-auto min-h-0">
                  {vsanWizardStep === 'SERVICES' && (
                      <div className="space-y-6">
                          <div className="space-y-2"><h3 className="font-bold text-lg text-gray-800">1. Tipo de Clúster</h3><label className="flex items-start gap-3 p-4 border rounded-xl cursor-pointer bg-blue-50 border-blue-200"><input type="radio" checked readOnly className="accent-blue-600 mt-1 w-4 h-4"/><div><div className="font-bold">{scenario === 'ROBO' ? 'vSAN 2-Node Cluster' : 'Single Site Cluster'}</div><div className="text-xs text-gray-600">{scenario === 'ROBO' ? '2 hosts de datos + 1 Witness remoto.' : 'Todos los hosts en el mismo sitio.'}</div></div></label></div>
                          <div className="space-y-2"><h3 className="font-bold text-lg text-gray-800">2. Configuración de Red (VMkernel)</h3><p className="text-sm text-gray-600 mb-2">Activa el servicio 'vSAN Traffic' en el VMkernel de cada host conectado.</p><div className="border rounded-xl shadow-sm">{hosts.filter(h => h.status === 'Connected').map(h => (<div key={h.id} className="p-3 border-b flex justify-between items-center text-sm last:border-0 hover:bg-gray-50"><div className="flex items-center gap-2 font-medium">{h.isWitness ? <Box size={14} className="text-purple-600"/> : <Server size={14} className="text-gray-500"/>} {h.name.split('.')[0]}</div><div className="flex items-center gap-4"><span className="text-gray-500 text-xs">vmk1 (vSAN)</span><button onClick={() => toggleVmkConfig(h.id)} className={`px-3 py-1 rounded-full text-xs font-bold transition-colors shadow-sm ${h.vmkConfigured ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-red-100 text-red-700 border border-red-200 hover:bg-red-200'}`}>{h.vmkConfigured ? <><CheckCircle size={12} className="inline mr-1"/> Habilitado</> : <><XCircle size={12} className="inline mr-1"/> Deshabilitado</>}</button></div></div>))}</div></div>
                      </div>
                  )}
                  {vsanWizardStep === 'CLAIM_DISKS' && (
                      <div className="space-y-6">
                          <div className="bg-blue-50 p-3 rounded-lg text-sm text-blue-800 border border-blue-200"><Info size={16} className="inline mr-2"/>{architecture === 'OSA' ? <>Instrucción OSA: Asigna **exactamente 1 SSD a Caché** y los discos restantes a **Capacidad** por host. </> : <>Instrucción ESA: Asigna **MÍNIMO 2** discos **NVMe** a **Storage Pool**. Los HDD no son compatibles en ESA. </>}</div>
                          <div className="space-y-4">{hosts.filter(h => h.status === 'Connected').map(h => (<div key={h.id} className="border rounded-xl shadow-md"><div className="bg-gray-200 p-3 font-bold text-sm flex gap-2 items-center rounded-t-xl">{h.isWitness ? <Box size={14} className="text-purple-600"/> : <Server size={14} className="text-gray-500"/>} {h.name}</div>{h.disks.map(d => (<div key={d.id} className="p-3 border-t flex justify-between items-center text-xs hover:bg-gray-50"><div className="flex gap-2 items-center w-1/3"><HardDrive size={14} className={d.type === 'SSD' || d.type === 'NVMe' ? 'text-blue-500' : 'text-gray-500'}/> {d.type} ({d.size})</div><div className="flex gap-2 text-gray-600">{h.isWitness ? (<button onClick={() => claimDisk(h.id, d.id, 'Witness')} className={`px-3 py-1 rounded-full border text-xs font-bold transition-colors w-full ${d.claimedAs === 'Witness' ? 'bg-purple-600 text-white border-purple-600' : 'hover:bg-purple-50 border-gray-300'}`}>Witness Metadata</button>) : (architecture === 'OSA' ? (<><button onClick={() => claimDisk(h.id, d.id, 'Cache')} className={`px-3 py-1 rounded-full border text-xs font-bold transition-colors ${d.claimedAs === 'Cache' ? 'bg-[#007cbb] text-white border-[#007cbb]' : 'hover:bg-blue-50 border-gray-300'}`} disabled={d.type !== 'SSD' && d.claimedAs !== 'Cache'} title={d.type !== 'SSD' ? 'Solo SSD/NVMe puede ser Caché' : ''}>Caché</button><button onClick={() => claimDisk(h.id, d.id, 'Capacity')} className={`px-3 py-1 rounded-full border text-xs font-bold transition-colors ${d.claimedAs === 'Capacity' ? 'bg-green-600 text-white border-green-600' : 'hover:bg-green-50 border-gray-300'}`} disabled={d.claimedAs !== 'Unclaimed' && d.claimedAs !== 'Capacity' && d.type === 'SSD'} title={d.type === 'SSD' ? 'SSD solo como Caché' : ''}>Capacidad</button></>) : (<button onClick={() => claimDisk(h.id, d.id, 'StoragePool')} className={`px-3 py-1 rounded-full border text-xs font-bold transition-colors w-full ${d.claimedAs === 'StoragePool' ? 'bg-purple-600 text-white border-purple-600' : 'hover:bg-purple-50 border-gray-300'}`} disabled={d.type === 'HDD' && d.claimedAs !== 'StoragePool'}>Storage Pool (ESA)</button>))}</div></div>))}</div>))}</div>
                      </div>
                  )}
                  {vsanWizardStep === 'REVIEW' && (
                      <div className="space-y-6">
                          <h3 className="font-bold text-xl text-gray-800 border-b pb-2">Resumen de Configuración</h3>
                          <div className="border rounded-xl p-6 text-sm bg-gray-50 space-y-3 shadow-inner"><div className="flex justify-between border-b pb-3"><span>Cluster:</span> <strong>ClusterLab</strong></div><div className="flex justify-between border-b pb-3"><span>Escenario:</span> <strong>{scenario}</strong></div><div className="flex justify-between border-b pb-3"><span>Arquitectura:</span> <strong>{architecture}</strong></div><div className="flex justify-between border-b pb-3"><span>Hosts Activos:</span> <strong>{hosts.filter(h=>h.status==='Connected').length}</strong></div><div className="flex justify-between border-b pb-3"><span>Capacidad Bruta Total:</span> <strong className="text-[#007cbb] text-lg">{calculateTotalCapacity()} TB</strong></div></div>
                          <div className="text-sm text-center text-gray-500 p-2 border rounded-lg bg-yellow-50 border-yellow-200">{scenario === 'ROBO' && <p className="text-purple-800 font-medium"> Nota: El cluster de 2 nodos utiliza un Witness Appliance para el quórum.</p>}</div>
                      </div>
                  )}
                  {vsanWizardStep === 'DEPLOYING' && (<div className="flex flex-col items-center justify-center h-full p-10"><RefreshCw size={48} className="text-[#007cbb] animate-spin mb-4"/><h3 className="text-xl font-bold text-gray-700">Configurando Cluster vSAN...</h3><p className="text-gray-500 mt-2">Creando grupos de discos, formateando vSanDatastore y habilitando servicios.</p></div>)}
              </div>
              <div className="p-4 border-t bg-gray-100 flex justify-end gap-3 shrink-0">{vsanWizardStep === 'SERVICES' && <button onClick={validateServicesAndProceed} className="px-6 py-2 bg-[#007cbb] text-white rounded-lg font-bold hover:bg-[#005a8a] transition-colors">Siguiente <ArrowRight size={16} className="inline ml-1"/></button>}{vsanWizardStep === 'CLAIM_DISKS' && (<><button onClick={() => setVsanWizardStep('SERVICES')} className="px-6 py-2 border bg-white rounded-lg hover:bg-gray-100 font-medium transition-colors">Atrás</button><button onClick={validateDisksAndProceed} className="px-6 py-2 bg-[#007cbb] text-white rounded-lg font-bold hover:bg-[#005a8a] transition-colors">Siguiente <ArrowRight size={16} className="inline ml-1"/></button></>)}{vsanWizardStep === 'REVIEW' && (<><button onClick={() => setVsanWizardStep('CLAIM_DISKS')} className="px-6 py-2 border bg-white rounded-lg hover:bg-gray-100 font-medium transition-colors">Atrás</button><button onClick={deployVSAN} className="px-6 py-2 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 transition-colors shadow-lg">Finalizar y Desplegar</button></>)}</div>
          </div>
      </div>
  );

  const renderStoragePolicySelector = () => {
      const activeHostsCount = hosts.filter(h => h.status === 'Connected' || h.status === 'Maintenance').length;
      
      const policies: { policy: StoragePolicy, consumption: string, required: number, desc: string }[] = [
        { policy: 'RAID1_FTT1', consumption: '200%', required: 3, desc: 'Tolerancia a 1 falla. Requiere 3 hosts.' },
        { policy: 'RAID5_FTT1', consumption: '133%', required: 4, desc: 'Tolerancia a 1 falla (Erasure Coding). Requiere 4 hosts.' },
        { policy: 'RAID1_FTT2', consumption: '300%', required: 5, desc: 'Tolerancia a 2 fallas. Requiere 5 hosts.' },
        { policy: 'RAID6_FTT2', consumption: '150%', required: 6, desc: 'Tolerancia a 2 fallas (Erasure Coding). Requiere 6 hosts.' },
        { policy: 'RAID1_FTT3', consumption: '400%', required: 7, desc: 'Tolerancia a 3 fallas. Requiere 7 hosts.' }
      ];

      return (
        <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
            <h4 className="font-bold text-gray-800 mb-3 flex items-center">
                Política de Almacenamiento (SPBM)  {renderTooltip("Storage Policy Based Management: Define la redundancia (FTT) y el consumo de espacio de los datos.")}
            </h4>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {policies.map(p => {
                    const isDisabled = activeHostsCount < p.required;
                    const isSelected = selectedPolicy === p.policy;
                    
                    return (
                        <label key={p.policy} className={`flex items-start gap-2 p-3 border rounded-xl cursor-pointer transition-colors shadow-sm ${isDisabled ? 'opacity-50 cursor-not-allowed bg-red-50' : isSelected ? 'bg-blue-100 border-blue-400' : 'bg-white border-gray-300'}`} onClick={() => { if(!isDisabled) setSelectedPolicy(p.policy) }}>
                            <input type="radio" name="policy" checked={isSelected} onChange={() => { if(!isDisabled) setSelectedPolicy(p.policy) }} className="accent-[#007cbb] mt-1" disabled={isDisabled}/>
                            <div>
                                <div className={`font-bold ${isDisabled ? 'text-red-700' : ''}`}>{p.policy.replace('_FTT', ' FTT=')}</div>
                                <div className="text-xs text-gray-600">
                                    Consumo: **{p.consumption}**. <br/>
                                    Req. Hosts: **{p.required}**.
                                </div>
                                {isDisabled && (
                                    <p className='text-[10px] text-red-600 mt-1 font-medium'>Faltan {p.required - activeHostsCount} hosts</p>
                                )}
                            </div>
                        </label>
                    );
                })}
            </div>
            {activeHostsCount > 0 && (
                <p className='text-xs text-blue-800 mt-3 p-2 bg-blue-100 rounded-lg border border-blue-200'>
                    <Info size={14} className="inline mr-1"/> Hosts en cluster: **{activeHostsCount}**.
                </p>
            )}
        </div>
      );
  };
  
  const renderVMComponentsDiagram = (vm: VM) => {
    const componentMap: { [key: string]: VMComponent[] } = {};
    vm.components.forEach(comp => {
        if (!componentMap[comp.hostId]) {
            componentMap[comp.hostId] = [];
        }
        componentMap[comp.hostId].push(comp);
    });

    const hostsInCluster = hosts.filter(h => h.status !== 'Unmanaged');
    
    return (
        <div className="mt-4 p-4 border rounded-xl bg-white shadow-inner">
            <h5 className="font-bold text-sm mb-3 border-b pb-2 flex items-center gap-2 text-[#007cbb]">
                <LayoutGrid size={14}/> Estructura de Componentes ({vm.policy}) {renderTooltip("Muestra cómo se distribuyen las réplicas (copias de datos) y el Witness (para decidir el Quórum) en los hosts físicos.")}
            </h5>
            <div className="flex flex-wrap justify-center items-start gap-4 p-2">
                {hostsInCluster.map(h => {
                    const comps = componentMap[h.id] || [];
                    const isHostDown = h.status === 'Disconnected' || h.isolationStatus === 'Isolated';
                    const isHostMaintenance = h.status === 'Maintenance';

                    const hostStyle = isHostDown ? 'border-red-600 bg-red-100 opacity-80' : isHostMaintenance ? 'border-yellow-600 bg-yellow-100 opacity-90' : 'border-gray-300 bg-gray-50';

                    return (
                        <div key={h.id} className="flex flex-col items-center w-[140px] shrink-0">
                            <div className={`p-2 rounded-xl border-2 w-full text-center font-bold text-xs shadow-md ${hostStyle}`}>
                                <Server size={14} className="inline mr-1"/> {h.name.split('.')[0]}
                                {isHostDown && <span className="text-red-700 block text-[10px] font-bold">(CAÍDO/AISLADO)</span>}
                                {isHostMaintenance && <span className="text-yellow-700 block text-[10px] font-bold">(MANTENIMIENTO)</span>}
                            </div>
                            <div className="mt-2 w-full space-y-1">
                                {comps.map(comp => {
                                    const compFailed = isHostDown || comp.status !== 'Active';
                                    const compColor = compFailed ? 'bg-red-200 text-red-800' : comp.type === 'Witness' ? 'bg-purple-200 text-purple-800' : 'bg-green-200 text-green-800';
                                    return (
                                        <div key={comp.id} className={`text-[10px] p-1 rounded-lg text-center font-medium ${compColor} transition-all duration-300 border`}>
                                            {comp.type === 'Data Replica' ? 'Réplica de Datos' : comp.type}
                                            {compFailed && <XCircle size={10} className="inline ml-1"/>}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
  };

  const renderFailureControl = () => {
    const hostsReady = hosts.filter(h => h.status === 'Connected' || h.status === 'Maintenance');
    const isBusy = vsanHealth === 'RESYNCING' || maintenanceHostId !== null;
    
    return (
        <div className="bg-white p-4 rounded-xl shadow-lg border space-y-4">
            <h3 className="font-bold text-gray-700 border-b pb-2 flex items-center gap-2"><Settings size={18} className="text-gray-600"/> Gestión de Hosts & Ciclo de Vida (LCM)</h3>
            <div className="space-y-3">
                {hostsReady.map(h => {
                    const currentFTT = parseInt(selectedPolicy.split('FTT')[1] || '1', 10);
                    const failedHostsCount = hosts.filter(h => h.status === 'Disconnected' || h.isolationStatus === 'Isolated' || h.status === 'Maintenance').length;
                    const canSimulateHostFailure = h.status === 'Connected' && !isBusy && (failedHostsCount < currentFTT);
                    const isUpgrading = upgradingHostId === h.id;
                    const isUpdated = h.version === TARGET_VERSION;
                    const hostFailsType = h.isolationStatus === 'Normal' ? 'HOST' : 'NETWORK';

                    return (
                        <div key={h.id} className="flex justify-between items-center text-xs p-3 bg-white rounded-lg border shadow-sm">
                            <div className="flex flex-col">
                                <span className={`font-bold text-sm flex items-center gap-2 ${h.isWitness ? 'text-purple-700' : 'text-gray-700'}`}>{h.isWitness && <Box size={14}/>} {h.name.split('.')[0]}</span>
                                <span className={`text-[10px] flex items-center gap-1 ${isUpdated ? 'text-green-600 font-bold' : 'text-gray-500'}`}><Cpu size={10}/> {h.version} {isUpdated && "(Actualizado)"}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                {isUpgrading ? (
                                    <div className="flex flex-col items-end w-32"><span className="text-[10px] text-blue-600 font-bold animate-pulse">Actualizando... {upgradeProgress}%</span><div className="w-full bg-gray-200 h-1.5 rounded-full mt-1"><div className="bg-blue-600 h-1.5 rounded-full transition-all duration-300" style={{width: `${upgradeProgress}%`}}></div></div></div>
                                ) : (
                                    <>
                                        {h.status === 'Maintenance' && !isUpdated && (
                                            <button onClick={() => upgradeHost(h.id)} className="px-3 py-1 bg-blue-600 text-white rounded-md font-bold hover:bg-blue-700 flex items-center gap-1 shadow-sm animate-pulse" title="Usar vSphere Lifecycle Manager para actualizar"><UploadCloud size={12}/> Update to U3</button>
                                        )}
                                        {h.status === 'Maintenance' ? (
                                            <button onClick={() => { setHosts(prev => prev.map(host => host.id === h.id ? { ...host, status: 'Connected' } : host)); addLog(`Host ${h.name.split('.')[0]} saliendo de mantenimiento.`); setVsanHealth('HEALTHY'); }} className="px-3 py-1 bg-green-500 text-white rounded-md hover:bg-green-600 font-medium">Salir Mantenimiento</button>
                                        ) : (
                                            <div className="flex gap-2">
                                                <button onClick={() => enterMaintenanceMode(h.id, 'EnsureAccessibility')} disabled={maintenanceHostId !== null} className="px-2 py-1 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-100 disabled:opacity-50 text-[10px]" title="Asegurar Accesibilidad: Los datos permanecen en el host pero las VMs se migran. Reduce redundancia temporalmente.">Asegurar Accesibilidad</button>
                                                <button onClick={() => enterMaintenanceMode(h.id, 'FullDataEvacuation')} disabled={maintenanceHostId !== null} className="px-2 py-1 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-100 disabled:opacity-50 text-[10px]" title="Evacuación Completa de Datos: Mueve TODOS los datos y las VMs a otros hosts. Mantiene la redundancia pero tarda más.">Evacuación Completa</button>
                                                <button onClick={() => simulateFailure(hostFailsType, h.id)} disabled={!canSimulateHostFailure} className={`px-3 py-1 rounded-md font-bold transition-colors shadow-sm text-white ${canSimulateHostFailure ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-300 cursor-not-allowed'}`} title={canSimulateHostFailure ? "Simular falla de host" : "No se puede simular falla ahora"}><Power size={14}/></button>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
            <div className="mt-4 p-3 rounded-xl border border-orange-400 bg-orange-50">
                <h4 className="font-bold text-gray-800 flex items-center gap-2 mb-2"><HardDrive size={16}/> Simulación de Falla de Disco</h4>
                <p className='text-xs text-gray-600 mb-2'>Simula la falla de un disco individual (WARNING/CRÍTICO según el rol).</p>
                <div className='space-y-2'>
                    {hosts.filter(h => h.status === 'Connected').map(h => (
                        <div key={h.id} className="p-1">
                            <h5 className='font-bold text-sm text-gray-700'>{h.name.split('.')[0]}</h5>
                            {h.disks.filter(d => d.claimedAs !== 'Unclaimed' && d.status === 'Healthy').map(d => (
                                <div key={d.id} className='flex justify-between items-center text-xs p-2 bg-white rounded-lg border ml-2'>
                                    <span className={`font-medium ${d.claimedAs === 'Cache' ? 'text-blue-600' : 'text-green-600'}`}>{d.claimedAs}: {d.type} ({d.size})</span>
                                    <button onClick={() => simulateFailure('DISK', d.id)} disabled={isBusy} className={`px-3 py-1 rounded-md font-bold transition-colors shadow-sm text-white ${isBusy ? 'bg-gray-400 cursor-not-allowed' : 'bg-orange-600 hover:bg-orange-700'}`}>Falla</button>
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            </div>
            <div className="bg-blue-50 text-blue-800 text-[10px] p-2 rounded border border-blue-100 flex gap-2"><Info size={14}/><span><strong>Tip Educativo:</strong> vSphere Lifecycle Manager (vLCM) requiere que el host esté en <em>Modo Mantenimiento</em> para aplicar parches. En vSAN, esto implica evacuar datos o asegurar accesibilidad.</span></div>
        </div>
    );
  };

  const renderOperationView = () => (
      <div className="flex flex-col h-full bg-[#f5f7fa]">
          <div className="bg-white px-6 border-b flex gap-6 shrink-0 shadow-sm">
             <div className={`py-3 cursor-pointer border-b-[3px] text-sm font-medium transition-colors ${activeTab === 'SUMMARY' ? 'border-[#007cbb] text-[#007cbb]' : 'border-transparent text-gray-600 hover:text-gray-800'}`} onClick={() => setActiveTab('SUMMARY')}>Resumen</div>
             <div className={`py-3 cursor-pointer border-b-[3px] text-sm font-medium transition-colors ${activeTab === 'MONITOR' ? 'border-[#007cbb] text-[#007cbb]' : 'border-transparent text-gray-600 hover:text-gray-800'}`} onClick={() => setActiveTab('MONITOR')}>Monitor (Simulación)</div>
             <div className={`py-3 cursor-pointer border-b-[3px] text-sm font-medium transition-colors ${activeTab === 'VMS' ? 'border-[#007cbb] text-[#007cbb]' : 'border-transparent text-gray-600 hover:text-gray-800'}`} onClick={() => setActiveTab('VMS')}>Máquinas Virtuales</div>
          </div>
          <div className="flex-1 p-6 overflow-y-auto">
              {activeTab === 'SUMMARY' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                      <div className="bg-white p-6 rounded-xl shadow-lg border col-span-1">
                          <h3 className="font-bold text-gray-700 mb-4 border-b pb-2 flex items-center gap-2"><Activity size={18}/> Salud de vSAN {renderTooltip("El estado de salud general del clúster vSAN.")}</h3>
                          <div className="flex items-center gap-4"><div className={`p-3 rounded-full ${vsanHealth === 'HEALTHY' ? 'bg-green-100' : vsanHealth === 'CRITICAL' ? 'bg-red-100' : vsanHealth === 'WARNING' ? 'bg-orange-100' : 'bg-blue-100'}`}>{renderHealthIcon(vsanHealth, 32)}</div><div><div className={`text-2xl font-bold ${vsanHealth === 'HEALTHY' ? 'text-green-600' : vsanHealth === 'CRITICAL' ? 'text-red-600' : vsanHealth === 'WARNING' ? 'text-orange-600' : 'text-blue-600'}`}>{vsanHealth}</div>{vsanHealth === 'RESYNCING' && (<div className="text-sm text-blue-600 mt-1">Reconstruyendo datos: {resyncProgress}%<div className="w-full bg-gray-200 rounded-full h-1.5 mt-1"><div className="bg-blue-600 h-1.5 rounded-full transition-all duration-500" style={{width: `${resyncProgress}%`}}></div></div></div>)}{vsanHealth === 'CRITICAL' && <div className="text-sm text-red-600 mt-1 font-bold">Pérdida de redundancia.</div>}{vsanHealth === 'WARNING' && <div className="text-sm text-orange-600 mt-1 font-bold">Riesgo de disponibilidad.</div>}</div></div>
                      </div>
                      <div className="bg-white p-6 rounded-xl shadow-lg border col-span-1"><h3 className="font-bold text-gray-700 mb-4 border-b pb-2 flex items-center gap-2"><HardDrive size={18}/> Capacidad Datastore {renderTooltip("Espacio total disponible y consumido.")}</h3><div className="text-4xl font-light text-[#007cbb]">{calculateUsedCapacity()} TB Usado</div><div className="text-sm text-gray-500">de {calculateTotalCapacity()} TB Total</div>{vms.length > 0 && <div className="text-xs text-gray-400 mt-2">Arquitectura: {architecture}. Hosts: {hosts.filter(h=>h.status==='Connected').length}.</div>}</div>
                      <div className="bg-white p-6 rounded-xl shadow-lg border col-span-1"><h3 className="font-bold text-gray-700 mb-4 border-b pb-2 flex items-center gap-2"><Server size={18}/> Estado de Hosts</h3><div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm"><div><span className='font-bold text-gray-600'>Total:</span> {hosts.filter(h=>h.status!=='Unmanaged').length}</div><div><span className='font-bold text-green-600'>Conectados:</span> {hosts.filter(h=>h.status==='Connected').length}</div><div><span className='font-bold text-red-600'>Desconectados:</span> {hosts.filter(h=>h.status==='Disconnected').length}</div><div><span className='font-bold text-yellow-600'>Mantenimiento:</span> {hosts.filter(h=>h.status==='Maintenance').length}</div></div></div>
                      <div className="bg-white p-6 rounded-xl shadow-lg border col-span-full xl:col-span-4"><h3 className="font-bold text-gray-700 mb-4 border-b pb-2 flex items-center gap-2"><Zap size={18}/> Acciones Rápidas</h3><div className="flex flex-col gap-3 w-full">{renderStoragePolicySelector()}{vms.length === 0 ? (<button onClick={createVMs} disabled={selectedPolicy === 'RAID5_FTT1' && hosts.filter(h=>h.status==='Connected').length < 4} className="bg-green-600 text-white px-4 py-2 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-green-700 shadow-md transition-colors w-full disabled:opacity-50"><Plus size={18}/> Desplegar VMs de Prueba (12x)</button>) : (<div className="text-sm text-center text-gray-500 p-2 border rounded-xl bg-gray-50">{vms.length} VMs desplegadas.</div>)}<button onClick={() => setActiveTab('MONITOR')} className="bg-blue-600 text-white px-4 py-2 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-blue-700 shadow-md transition-colors w-full disabled:opacity-50"><Siren size={18}/> Ir a Simulación de Fallas</button></div></div>
                  </div>
              )}
              {activeTab === 'MONITOR' && (
                  <div className="space-y-6">
                      <div className="bg-[#1e1e1e] p-4 rounded-xl text-xs font-mono h-40 overflow-y-auto text-green-400 shadow-inner border border-gray-700">{logs.map((l, i) => <div key={i} className={l.includes('ERROR') ? 'text-red-400' : ''}>{l}</div>)}<div ref={logsEndRef}/></div>
                      <div className="grid grid-cols-1"><div className="col-span-1">{renderFailureControl()}</div></div>
                      <h3 className="font-bold text-gray-700 border-b pb-2 flex items-center gap-2 mt-6"><Monitor size={18}/> Monitoreo de Hosts y Discos</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">{hosts.filter(h => h.status !== 'Unmanaged').map(h => (<div key={h.id} className={`bg-white p-4 rounded-xl border-2 transition-all duration-300 shadow-lg ${h.status === 'Disconnected' ? 'border-red-500 bg-red-50 opacity-80' : h.status === 'Maintenance' ? 'border-yellow-500 bg-yellow-50 opacity-90' : 'border-gray-200'}`}><div className="flex justify-between mb-4 font-bold border-b pb-2"><span className="truncate flex items-center gap-2"><Server size={14} className={h.status === 'Disconnected' ? 'text-red-500' : h.status === 'Maintenance' ? 'text-yellow-600' : 'text-gray-700'}/> {h.name.split('.')[0]}</span>{h.status === 'Disconnected' && (<button onClick={() => simulateRecovery(h.id, h.isolationStatus === 'Isolated' ? 'NETWORK' : 'HOST')} className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full border border-blue-200 hover:bg-blue-200" title="Volver a conectar Host" disabled={vsanHealth === 'RESYNCING'}><RefreshCw size={12} className="inline mr-1"/> Recuperar</button>)}{h.status === 'Connected' && <span className="text-green-600 text-xs font-bold">Conectado</span>}{h.status === 'Maintenance' && <span className="text-yellow-600 text-xs font-bold">Mantenimiento</span>}{h.status === 'Connected' && (!h.vmkConfigured || h.disks.filter(d => d.claimedAs !== 'Unclaimed').length === 0) && (<span className="text-red-600 text-[10px] font-bold bg-red-100 px-2 rounded-full border border-red-200 ml-1">CONFIG PENDIENTE</span>)}</div><div className="space-y-2"><div className={`flex justify-between text-xs p-2 rounded-lg transition-colors bg-gray-100 border ${h.vmkConfigured ? 'border-green-200' : 'border-red-200'}`}><span className='font-medium'>VMkernel vSAN</span><button onClick={() => toggleVmkConfig(h.id)} className={`px-3 py-1 rounded-full text-xs font-bold transition-colors shadow-sm ${h.vmkConfigured ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700 hover:bg-red-200'}`}>{h.vmkConfigured ? <><CheckCircle size={12} className="inline mr-1"/> Habilitado</> : <><XCircle size={12} className="inline mr-1"/> Deshabilitado</>}</button></div><h4 className="text-[10px] font-bold text-gray-600 mt-2">Reclamo de Discos:</h4>{h.disks.map(d => (<div key={d.id} className={`flex justify-between text-xs p-2 rounded-lg transition-colors bg-white border border-gray-200 ${d.status === 'Failed' ? 'bg-red-50' : ''}`}><span className="flex gap-1 items-center font-medium"><HardDrive size={12} className={d.type === 'SSD' || d.type === 'NVMe' ? 'text-blue-500' : 'text-gray-500'}/> {d.claimedAs === 'Unclaimed' ? 'Sin Reclamar' : d.claimedAs === 'StoragePool' ? 'Pool (ESA)' : d.claimedAs} ({d.type})</span>{d.status === 'Failed' || h.status === 'Disconnected' ? (<button onClick={() => simulateRecovery(d.id, 'DISK')} className="text-red-600 flex items-center gap-1 font-bold bg-red-200 px-2 rounded-full hover:bg-red-300 disabled:opacity-50" disabled={vsanHealth === 'RESYNCING' || (h.status === 'Connected' && d.status === 'Healthy')}><XCircle size={10}/> Fallido/Inactivo</button>) : (<button onClick={() => claimDisk(h.id, d.id, architecture === 'OSA' ? (d.type === 'SSD' ? 'Cache' : 'Capacity') : 'StoragePool')} className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${d.claimedAs === 'Unclaimed' ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-500'}`} title={d.claimedAs === 'Unclaimed' ? 'Reclamar' : 'Reclamado'} disabled={d.claimedAs !== 'Unclaimed'}>{d.claimedAs === 'Unclaimed' ? 'Reclamar' : 'Listo'}</button>)}</div>))}</div></div>))}</div>
                  </div>
              )}
              {activeTab === 'VMS' && (
                  <div className="bg-white rounded-xl border border-gray-300 overflow-hidden shadow-lg">
                      {vms.length > 0 ? (
                          <table className="w-full text-sm text-left"><thead className="bg-gray-100 text-gray-600 border-b"><tr><th className="p-3">Nombre</th><th className="p-3">Estado</th><th className="p-3">Host Actual</th><th className="p-3">Política (Consumo)</th><th className="p-3">Capacidad Total Ocupada</th><th className="p-3">Cumplimiento vSAN (SPBM)</th></tr></thead><tbody>{vms.map(vm => (<React.Fragment key={vm.id}><tr className="border-b hover:bg-gray-50 transition-colors cursor-pointer" onClick={(e) => {const target = e.currentTarget.nextElementSibling as HTMLElement; if (target) target.classList.toggle('hidden');}}><td className="p-3 font-medium flex items-center gap-2"><Monitor size={14} className="text-gray-500"/> {vm.name}</td><td className="p-3">{vm.state === 'PoweredOn' ? <span className="text-green-600 flex items-center gap-1 font-medium"><CheckCircle size={12}/> Encendida</span> : <span className="text-gray-400 flex items-center gap-1"><XCircle size={12}/> Apagada</span>}</td><td className="p-3 text-gray-500"><Server size={14} className="inline mr-1"/> {hosts.find(h => h.id === vm.hostId)?.name.split('.')[0] || "Desconocido"}</td><td className="p-3 text-xs font-mono">{vm.policy === 'RAID1_FTT1' ? 'RAID-1 (200%)' : vm.policy === 'RAID5_FTT1' ? 'RAID-5 (133%)' : vm.policy.replace('_FTT', ' FTT=')}</td><td className="p-3 font-mono text-xs text-[#007cbb] font-bold">{vm.usedSpaceGB} GB <span className='text-gray-500 font-normal'>({vm.sizeGB} GB lógico)</span></td><td className="p-3">{vm.compliance === 'Compliant' ? <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-xs border border-green-200 font-bold flex items-center w-fit"><ShieldCheck size={12} className="mr-1"/> Cumple</span> : <span className="bg-red-100 text-red-800 px-3 py-1 rounded-full text-xs border border-red-200 font-bold flex items-center w-fit animate-pulse"><AlertTriangle size={12} className="mr-1"/> No Cumple</span>}</td></tr><tr className="hidden bg-gray-50"><td colSpan={6} className="p-2">{renderVMComponentsDiagram(vm)}</td></tr></React.Fragment>))}</tbody></table>
                      ) : (<div className="p-4 text-center text-gray-500 italic">No hay VMs desplegadas. Ve a Resumen para crear algunas.</div>)}
                  </div>
              )}
          </div>
      </div>
  );

  return (
    <div className="flex flex-col h-screen font-sans text-[#2d3640] bg-[#f5f7fa]">
      <div className="bg-[#1e2730] text-white h-[48px] flex items-center justify-between px-4 border-b border-[#444] shrink-0 z-50 shadow-xl">
          <div className="flex items-center gap-6"><span className="font-bold text-lg">VMware vSphere Client</span><span className="text-gray-400 text-sm pl-4 border-l border-gray-600 font-mono">LAB: vSAN 8</span></div>
          <div className="flex items-center gap-4 text-xs"><button onClick={resetLab} className="bg-red-600 text-white px-3 py-1 rounded-full font-bold hover:bg-red-700 flex items-center gap-2 shadow-md transition-transform hover:scale-105"><RotateCcw size={14}/> Reiniciar Lab</button><div className="flex items-center gap-2 text-gray-300"><User size={16}/> <span>student@riveritatech.local</span></div></div>
      </div>
      <div className="flex flex-1 overflow-hidden">
          {(phase !== 'INTRO' || clusterCreated) && renderSidebar()}
          <div className="flex-1 flex flex-col relative overflow-hidden">
              {phase === 'INTRO' && renderIntro()}
              {phase === 'CREATE_CLUSTER' && renderCreateCluster()}
              {phase === 'ADD_HOSTS' && renderAddHosts()}
              {phase === 'CONFIG_VSAN' && renderConfigVSAN()} 
              {phase === 'OPERATION' && renderOperationView()}
          </div>
      </div>
    </div>
  );
};

export default RiveritatechVSANMasterLab;
