/**
 * dynamic-simulator.js
 * Motor de Simulación Dinámica Matricial de 2 Grados de Libertad (2-GDL)
 * Integración Numérica Paso a Paso Newmark-Beta (Aceleración Promedio)
 * Universidad Técnica de Manabí (UTM) - Facultad de Ciencias Matemáticas, Físicas y Químicas
 * Asignatura: Diseño Estructural / Dinámica Estructural
 */

class DynamicSimulator {
  constructor(structuralEngine) {
    this.engine = structuralEngine;

    // Estado del ensayo dinámico
    this.isRunning = false;
    this.isPaused = false;
    this.time = 0.0;          // Tiempo actual en segundos
    this.lastTimestamp = null;
    this.dt = 0.01;           // Paso de integración Newmark dt = 0.01 s (100 Hz)

    // Parámetros de Excitación en la Base
    this.params = {
      mode: 'harmonic',       // 'harmonic', 'sweep', 'record', 'custom_csv'
      frequency: 2.2,         // Frecuencia armónica f en Hz
      accelAmpMs2: 1.96,      // Amplitud de aceleración de la base en m/s² (0.20g = 1.96 m/s²)
      accelAmpG: 0.20,        // Amplitud en fracción de g
      sweepStartF: 0.5,       // Inicio de barrido (Hz)
      sweepEndF: 4.5,         // Fin de barrido (Hz)
      sweepDuration: 25.0,    // Duración del barrido en segundos
      direction: 'XZ',        // 'X', 'Z', o 'XZ' (Diagonal biaxial)
      dampingRatio: 0.05,     // Amortiguamiento crítico modal xi = 5% (NEC-SE-DS)
      visualScale: 15.0,      // Factor de amplificación visual 3D
      activeDisplayCase: 'compare' // 'case1', 'case2', o 'compare'
    };

    // Propiedades Dinámicas de 2 GDL (Caso 1: Original | Caso 2: Mitigado)
    this.systemC1 = null;
    this.systemC2 = null;

    // Estado Numérico de Integración [u1, u2] (Desplazamientos, Velocidades, Aceleraciones)
    this.stateC1 = { u: [0, 0], v: [0, 0], a: [0, 0] };
    this.stateC2 = { u: [0, 0], v: [0, 0], a: [0, 0] };

    // Registro de picos máximos históricos
    this.peaks = {
      c1: { maxU1: 0, maxU2: 0, maxDrift1: 0, maxDrift2: 0, maxAbsA2: 0 },
      c2: { maxU1: 0, maxU2: 0, maxDrift1: 0, maxDrift2: 0, maxAbsA2: 0 }
    };

    // Buffer Histórico para Gráficas y Exportación CSV
    this.maxHistoryPoints = 300;
    this.history = []; // Array de { t, ag, ug, u1_1, u2_1, u1_2, u2_2, d1_1, d2_1, d1_2, d2_2 }
    this.fullLog = []; // Almacena todos los puntos para exportación CSV completa

    // Acelerograma Pregrabado: Terremoto de Pedernales / Manabí 2016 (Mw 7.8)
    this.seismicRecord = this.generatePedernalesRecord();

    // Acelerograma Personalizado por CSV
    this.customRecord = null;

    // Referencias a Canvases 2D
    this.chartCanvas = null;
    this.chartCtx = null;
    this.driftCanvas = null;
    this.driftCtx = null;

    // Inicializar matrices dinámicas
    this.rebuildMatrices();
  }

  /**
   * Genera una señal acelerográfica realista representativa del Terremoto de Manabí 2016 (PGA ~ 0.38g = 3.73 m/s²)
   */
  generatePedernalesRecord() {
    const dt = 0.01;
    const duration = 25.0;
    const N = Math.floor(duration / dt);
    const data = [];
    const pga = 3.73; // m/s²

    for (let i = 0; i < N; i++) {
      const t = i * dt;
      // Envolvente de Jennings-Housner (crecimiento, meseta, decaimiento)
      let env = 0;
      if (t < 3.0) env = (t / 3.0) * (t / 3.0);
      else if (t < 11.0) env = 1.0;
      else env = Math.exp(-0.25 * (t - 11.0));

      // Contenido frecuencial multiespectral típico de subducción en suelo de Manabí
      const w1 = 2 * Math.PI * 1.4;
      const w2 = 2 * Math.PI * 2.3;
      const w3 = 2 * Math.PI * 3.6;
      const w4 = 2 * Math.PI * 0.8;

      const raw = (
        0.55 * Math.sin(w1 * t) +
        0.35 * Math.sin(w2 * t + 0.5) +
        0.20 * Math.sin(w3 * t + 1.2) +
        0.15 * Math.sin(w4 * t + 2.1)
      );

      const ag = env * raw * (pga / 1.1);
      data.push({ t, ag });
    }
    return { dt, duration, pga, data };
  }

  /**
   * Construye las matrices M, K, C y calcula frecuencias y modos para ambos casos (2 GDL)
   */
  rebuildMatrices() {
    const p = this.engine ? this.engine.params : {
      Lx: 31.0, Lz: 28.0, wInf: 10.0, wSup: 11.0, a: 20.0, b: 18.0,
      colWidth: 0.45, colDepth: 0.45, storyHeight: 3.0
    };

    // Área en planta en forma de L (croquis Portoviejo: 31x10 + 11x18 = 508 m²)
    const area = (p.Lx * p.wInf) + (p.wSup * (p.Lz - p.wInf));

    // Carga muerta D + 25% Carga Viva L según NEC-SE-DS para uso comercial
    // Piso 1: 760 kg/m² = 7.45 kN/m² -> masa m1 en kg
    const m1 = 760.0 * area;
    // Piso 2 (Cubierta): 515 kg/m² = 5.05 kN/m² -> masa m2 en kg
    const m2 = 515.0 * area;

    // Rigidez lateral de columnas de hormigón armado (E = 21.5 GPa)
    const Ec = 2.15e10; // N/m²
    const Ic = (p.colWidth * Math.pow(p.colDepth, 3)) / 12.0;
    const h = p.storyHeight;
    // Rigidez lateral aproximada por columna considerando flexibilidad de vigas de pórtico
    const kColUnit = (12.0 * Ec * Ic) / Math.pow(h, 3) * 0.52; // Factor de pórtico

    const numCols = this.engine && this.engine.columnsData ? this.engine.columnsData.length : 30;

    // Rigidez lateral de entrepiso Caso 1 (Original)
    const k1_c1 = numCols * kColUnit;
    const k2_c1 = numCols * kColUnit * 0.92;

    // Rigidez lateral de entrepiso Caso 2 (Mitigado con diagonales en X)
    // Las diagonales concéntricas de acero perimetrales aumentan sustancialmente la rigidez lateral
    const kBrace = kColUnit * 1.45 * 8.0; // 8 vanos arriostrados en X
    const k1_c2 = k1_c1 + kBrace;
    const k2_c2 = k2_c1 + kBrace;

    // Construcción del sistema para cada caso
    this.systemC1 = this.solve2DOFSystem(m1, m2, k1_c1, k2_c1, this.params.dampingRatio);
    this.systemC2 = this.solve2DOFSystem(m1, m2, k1_c2, k2_c2, this.params.dampingRatio);
  }

  /**
   * Resuelve el problema de autovalores de 2 GDL y construye matrices M, K, C
   */
  solve2DOFSystem(m1, m2, k1, k2, xi) {
    const M = [
      [m1, 0],
      [0, m2]
    ];

    const K = [
      [k1 + k2, -k2],
      [-k2, k2]
    ];

    // Ecuación característica: det(K - w² M) = 0
    // (m1 * m2)*w⁴ - [m1*k2 + m2*(k1+k2)]*w² + k1*k2 = 0
    const aCoeff = m1 * m2;
    const bCoeff = -(m1 * k2 + m2 * (k1 + k2));
    const cCoeff = k1 * k2;

    const disc = Math.sqrt(Math.max(0, bCoeff * bCoeff - 4 * aCoeff * cCoeff));
    const w1_sq = (-bCoeff - disc) / (2 * aCoeff);
    const w2_sq = (-bCoeff + disc) / (2 * aCoeff);

    const w1 = Math.sqrt(w1_sq);
    const w2 = Math.sqrt(w2_sq);

    const f1 = w1 / (2 * Math.PI);
    const f2 = w2 / (2 * Math.PI);
    const T1 = 1.0 / f1;
    const T2 = 1.0 / f2;

    // Modos de vibración normalizados a piso 2 = 1.0
    // (k1 + k2 - w² m1)*phi1 - k2*phi2 = 0 -> phi1 = k2 / (k1 + k2 - w² m1)
    const phi1_mode1 = k2 / (k1 + k2 - w1_sq * m1);
    const phi1_mode2 = k2 / (k1 + k2 - w2_sq * m1);

    // Amortiguamiento de Rayleigh: C = a0 * M + a1 * K (con xi = 5% para ambos modos)
    const a0 = xi * ((2 * w1 * w2) / (w1 + w2));
    const a1 = xi * (2.0 / (w1 + w2));

    const C = [
      [a0 * m1 + a1 * (k1 + k2), a1 * (-k2)],
      [a1 * (-k2), a0 * m2 + a1 * k2]
    ];

    return {
      m1, m2, k1, k2,
      M, K, C,
      w1, w2, f1, f2, T1, T2,
      phiMode1: [phi1_mode1, 1.0],
      phiMode2: [phi1_mode2, 1.0],
      a0, a1
    };
  }

  /**
   * Inicializa las referencias a los canvas de gráficas
   */
  initCanvases(chartCanvasId, driftCanvasId) {
    this.chartCanvas = document.getElementById(chartCanvasId);
    if (this.chartCanvas) this.chartCtx = this.chartCanvas.getContext('2d');
    this.driftCanvas = document.getElementById(driftCanvasId);
    if (this.driftCanvas) this.driftCtx = this.driftCanvas.getContext('2d');
    this.drawInitialCanvases();
  }

  start() {
    if (!this.isRunning) {
      this.isRunning = true;
      this.isPaused = false;
      this.lastTimestamp = performance.now();
    } else if (this.isPaused) {
      this.isPaused = false;
      this.lastTimestamp = performance.now();
    }
  }

  pause() {
    this.isPaused = true;
  }

  reset() {
    this.isRunning = false;
    this.isPaused = false;
    this.time = 0.0;
    this.lastTimestamp = null;
    this.stateC1 = { u: [0, 0], v: [0, 0], a: [0, 0] };
    this.stateC2 = { u: [0, 0], v: [0, 0], a: [0, 0] };
    this.peaks = {
      c1: { maxU1: 0, maxU2: 0, maxDrift1: 0, maxDrift2: 0, maxAbsA2: 0 },
      c2: { maxU1: 0, maxU2: 0, maxDrift1: 0, maxDrift2: 0, maxAbsA2: 0 }
    };
    this.history = [];
    this.fullLog = [];

    if (this.engine && this.engine.resetDynamicMotion) {
      this.engine.resetDynamicMotion();
    }

    this.rebuildMatrices();
    this.drawInitialCanvases();
  }

  /**
   * Obtiene la aceleración del terreno ag(t) según la modalidad configurada
   */
  getGroundAcceleration(t) {
    const { mode, frequency, accelAmpMs2, sweepStartF, sweepEndF, sweepDuration } = this.params;

    if (mode === 'harmonic') {
      // Excitación armónica pura: ag(t) = A * sin(2*pi*f*t) [m/s²]
      return accelAmpMs2 * Math.sin(2 * Math.PI * frequency * t);
    } else if (mode === 'sweep') {
      // Barrido de frecuencias continuo (Chirp): f(t) = f0 + (f1 - f0)*(t/T)
      const frac = Math.min(1.0, t / sweepDuration);
      const curF = sweepStartF + (sweepEndF - sweepStartF) * frac;
      const phase = 2 * Math.PI * (sweepStartF * t + 0.5 * (sweepEndF - sweepStartF) * (t * t / sweepDuration));
      return accelAmpMs2 * Math.sin(phase);
    } else if (mode === 'record') {
      // Registro sísmico real de Pedernales 2016
      const rec = this.seismicRecord;
      const idx = Math.floor(t / rec.dt);
      if (idx < rec.data.length) {
        return rec.data[idx].ag * (accelAmpMs2 / 3.73);
      }
      return 0.0;
    } else if (mode === 'custom_csv' && this.customRecord) {
      // Registro cargado por el usuario
      const rec = this.customRecord;
      const idx = Math.floor(t / rec.dt);
      if (idx < rec.data.length) {
        return rec.data[idx].ag;
      }
      return 0.0;
    }
    return 0.0;
  }

  /**
   * Integrador Numérico Newmark-Beta (Aceleración Promedio: gamma = 0.5, beta = 0.25)
   * Resuelve el sistema matricial de 2 GDL para el paso dt
   */
  integrateNewmarkStep(sys, state, agCurrent, agNext, dt) {
    const gamma = 0.5;
    const beta = 0.25;

    const { M, K, C } = sys;
    const { u, v, a } = state;

    // Matriz de rigidez efectiva K_hat = K + (1 / (beta*dt²))*M + (gamma / (beta*dt))*C
    const cM = 1.0 / (beta * dt * dt);
    const cC = gamma / (beta * dt);

    const K_hat = [
      [K[0][0] + cM * M[0][0] + cC * C[0][0], K[0][1] + cC * C[0][1]],
      [K[1][0] + cC * C[1][0], K[1][1] + cM * M[1][1] + cC * C[1][1]]
    ];

    // Fuerza sísmica efectiva P_next = -M * r * agNext
    const P1_next = -M[0][0] * agNext;
    const P2_next = -M[1][1] * agNext;

    // Términos inerciales y viscosos acumulados
    const aM1 = (1.0 / (beta * dt * dt)) * u[0] + (1.0 / (beta * dt)) * v[0] + (1.0 / (2 * beta) - 1.0) * a[0];
    const aM2 = (1.0 / (beta * dt * dt)) * u[1] + (1.0 / (beta * dt)) * v[1] + (1.0 / (2 * beta) - 1.0) * a[1];

    const aC1 = (gamma / (beta * dt)) * u[0] + (gamma / beta - 1.0) * v[0] + dt * (gamma / (2 * beta) - 1.0) * a[0];
    const aC2 = (gamma / (beta * dt)) * u[1] + (gamma / beta - 1.0) * v[1] + dt * (gamma / (2 * beta) - 1.0) * a[1];

    const P_hat1 = P1_next + M[0][0] * aM1 + (C[0][0] * aC1 + C[0][1] * aC2);
    const P_hat2 = P2_next + M[1][1] * aM2 + (C[1][0] * aC1 + C[1][1] * aC2);

    // Resolver sistema 2x2 por regla de Cramer
    const detK = K_hat[0][0] * K_hat[1][1] - K_hat[0][1] * K_hat[1][0];
    const u1_next = (P_hat1 * K_hat[1][1] - P_hat2 * K_hat[0][1]) / detK;
    const u2_next = (K_hat[0][0] * P_hat2 - K_hat[1][0] * P_hat1) / detK;

    // Actualizar aceleraciones: a_next = (u_next - u)/(beta*dt²) - v/(beta*dt) - (1/(2*beta) - 1)*a
    const a1_next = cM * (u1_next - u[0]) - (1.0 / (beta * dt)) * v[0] - (1.0 / (2 * beta) - 1.0) * a[0];
    const a2_next = cM * (u2_next - u[1]) - (1.0 / (beta * dt)) * v[1] - (1.0 / (2 * beta) - 1.0) * a[1];

    // Actualizar velocidades: v_next = v + dt * ((1 - gamma)*a + gamma*a_next)
    const v1_next = v[0] + dt * ((1.0 - gamma) * a[0] + gamma * a1_next);
    const v2_next = v[1] + dt * ((1.0 - gamma) * a[1] + gamma * a2_next);

    return {
      u: [u1_next, u2_next],
      v: [v1_next, v2_next],
      a: [a1_next, a2_next]
    };
  }

  /**
   * Actualiza el bucle de simulación a 60 fps e integra los pasos de tiempo necesarios
   */
  update(currentTimestamp) {
    if (!this.isRunning || this.isPaused) return;

    if (!this.lastTimestamp) this.lastTimestamp = currentTimestamp;
    const elapsedRealSec = (currentTimestamp - this.lastTimestamp) / 1000.0;
    this.lastTimestamp = currentTimestamp;

    // Subpasos numéricos de integración fija dt = 0.01s para precisión absoluta
    const numSteps = Math.min(10, Math.max(1, Math.round(elapsedRealSec / this.dt)));

    for (let s = 0; s < numSteps; s++) {
      const tNow = this.time;
      const tNext = tNow + this.dt;

      const agNow = this.getGroundAcceleration(tNow);
      const agNext = this.getGroundAcceleration(tNext);

      // Integrar Paso Newmark para Caso 1 (Original)
      this.stateC1 = this.integrateNewmarkStep(this.systemC1, this.stateC1, agNow, agNext, this.dt);

      // Integrar Paso Newmark para Caso 2 (Mitigado)
      this.stateC2 = this.integrateNewmarkStep(this.systemC2, this.stateC2, agNow, agNext, this.dt);

      this.time = tNext;

      // Calcular derivas instantáneas (Delta / h)
      const hStory = this.engine ? this.engine.params.storyHeight : 3.0;

      const drift1_c1 = Math.abs(this.stateC1.u[0]) / hStory;
      const drift2_c1 = Math.abs(this.stateC1.u[1] - this.stateC1.u[0]) / hStory;

      const drift1_c2 = Math.abs(this.stateC2.u[0]) / hStory;
      const drift2_c2 = Math.abs(this.stateC2.u[1] - this.stateC2.u[0]) / hStory;

      // Registrar picos máximos absolutos
      this.peaks.c1.maxU1 = Math.max(this.peaks.c1.maxU1, Math.abs(this.stateC1.u[0]));
      this.peaks.c1.maxU2 = Math.max(this.peaks.c1.maxU2, Math.abs(this.stateC1.u[1]));
      this.peaks.c1.maxDrift1 = Math.max(this.peaks.c1.maxDrift1, drift1_c1);
      this.peaks.c1.maxDrift2 = Math.max(this.peaks.c1.maxDrift2, drift2_c1);
      this.peaks.c1.maxAbsA2 = Math.max(this.peaks.c1.maxAbsA2, Math.abs(this.stateC1.a[1] + agNext));

      this.peaks.c2.maxU1 = Math.max(this.peaks.c2.maxU1, Math.abs(this.stateC2.u[0]));
      this.peaks.c2.maxU2 = Math.max(this.peaks.c2.maxU2, Math.abs(this.stateC2.u[1]));
      this.peaks.c2.maxDrift1 = Math.max(this.peaks.c2.maxDrift1, drift1_c2);
      this.peaks.c2.maxDrift2 = Math.max(this.peaks.c2.maxDrift2, drift2_c2);
      this.peaks.c2.maxAbsA2 = Math.max(this.peaks.c2.maxAbsA2, Math.abs(this.stateC2.a[1] + agNext));

      // Guardar en buffer visual
      const ugDisp = this.params.mode === 'harmonic' 
        ? -agNext / Math.pow(2 * Math.PI * Math.max(0.1, this.params.frequency), 2)
        : 0.0;

      const recordPt = {
        t: this.time,
        ag: agNext,
        ug: ugDisp * 1000.0, // mm
        u1_1: this.stateC1.u[0] * 1000.0, // mm
        u2_1: this.stateC1.u[1] * 1000.0,
        u1_2: this.stateC2.u[0] * 1000.0,
        u2_2: this.stateC2.u[1] * 1000.0,
        d1_1: drift1_c1,
        d2_1: drift2_c1,
        d1_2: drift1_c2,
        d2_2: drift2_c2
      };

      this.history.push(recordPt);
      if (this.history.length > this.maxHistoryPoints) this.history.shift();

      // Guardar en log completo para exportación CSV (hasta 3000 puntos / 30 seg)
      if (this.fullLog.length < 3000) {
        this.fullLog.push(recordPt);
      }
    }

    // Aplicar cinemática 3D en la maqueta Three.js
    if (this.engine && this.engine.applyDynamicMotion) {
      const isMitigated = this.engine.params.isMitigated;
      const activeState = isMitigated ? this.stateC2 : this.stateC1;
      const agNow = this.getGroundAcceleration(this.time);
      const ugDisp = this.params.mode === 'harmonic'
        ? -agNow / Math.pow(2 * Math.PI * Math.max(0.1, this.params.frequency), 2)
        : 0.0;

      // Estimación cualitativa de torsión theta por excentricidad e
      const eccArm = this.engine.analysisResults ? parseFloat(this.engine.analysisResults.eccentricity.torsionalArm) : 1.41;
      const thetaFactor = isMitigated ? 0.15 : 1.0;
      const theta1 = (eccArm / this.engine.params.Lx) * (activeState.u[0] / 3.0) * thetaFactor;
      const theta2 = (eccArm / this.engine.params.Lx) * (activeState.u[1] / 3.0) * thetaFactor;

      this.engine.applyDynamicMotion({
        ug: ugDisp,
        uStories: [activeState.u[0], activeState.u[1]],
        thetaStories: [theta1, theta2],
        direction: this.params.direction,
        visualScale: this.params.visualScale
      });
    }

    // Dibujar gráficas de respuesta y derivas
    this.drawChart();
    this.drawDrifts();
  }

  /**
   * Carga y parsea un archivo CSV de aceleración sísmica proporcionado por el usuario
   */
  loadCustomCSV(fileContent) {
    try {
      const lines = fileContent.trim().split('\n');
      const data = [];
      let dt = 0.01;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || line.startsWith('#') || line.toLowerCase().startsWith('t')) continue;
        const parts = line.split(/[,;\t\s]+/);
        if (parts.length >= 2) {
          const t = parseFloat(parts[0]);
          const ag = parseFloat(parts[1]);
          if (!isNaN(t) && !isNaN(ag)) {
            data.push({ t, ag });
          }
        }
      }

      if (data.length < 10) {
        throw new Error('El archivo CSV contiene menos de 10 puntos válidos.');
      }

      dt = (data[data.length - 1].t - data[0].t) / (data.length - 1);
      const pga = Math.max(...data.map(d => Math.abs(d.ag)));

      this.customRecord = {
        dt,
        duration: data[data.length - 1].t,
        pga,
        data
      };

      this.params.mode = 'custom_csv';
      return { success: true, count: data.length, dt, pga };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Exporta los datos de simulación calculados a un archivo CSV descargable
   */
  exportCSV() {
    if (this.fullLog.length === 0) return false;

    let csvContent = "tiempo_s,acel_base_ms2,u_base_mm,u1_caso1_mm,u2_caso1_mm,deriva1_caso1_pct,deriva2_caso1_pct,u1_caso2_mm,u2_caso2_mm,deriva1_caso2_pct,deriva2_caso2_pct\n";

    this.fullLog.forEach(row => {
      csvContent += `${row.t.toFixed(3)},${row.ag.toFixed(4)},${row.ug.toFixed(3)},` +
                    `${row.u1_1.toFixed(3)},${row.u2_1.toFixed(3)},${(row.d1_1 * 100).toFixed(4)},${(row.d2_1 * 100).toFixed(4)},` +
                    `${row.u1_2.toFixed(3)},${row.u2_2.toFixed(3)},${(row.d1_2 * 100).toFixed(4)},${(row.d2_2 * 100).toFixed(4)}\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    link.download = `Ensayo_Dinamico_2GDL_UTM_${timestamp}.csv`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
    return true;
  }

  /**
   * Obtiene la tabla comparativa cuantitativa calculada para el informe
   */
  getComparisonSummary() {
    const c1 = this.peaks.c1;
    const c2 = this.peaks.c2;

    const calcRed = (orig, mit) => {
      if (orig <= 1e-6) return "No calculable";
      const pct = ((orig - mit) / orig) * 100.0;
      return `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`;
    };

    return {
      f1_orig: `${this.systemC1.f1.toFixed(2)} Hz (T1 = ${this.systemC1.T1.toFixed(2)} s)`,
      f1_mit: `${this.systemC2.f1.toFixed(2)} Hz (T1 = ${this.systemC2.T1.toFixed(2)} s)`,
      f2_orig: `${this.systemC1.f2.toFixed(2)} Hz (T2 = ${this.systemC1.T2.toFixed(2)} s)`,
      f2_mit: `${this.systemC2.f2.toFixed(2)} Hz (T2 = ${this.systemC2.T2.toFixed(2)} s)`,

      u1_orig: (c1.maxU1 * 1000).toFixed(2),
      u1_mit: (c2.maxU1 * 1000).toFixed(2),
      u1_red: calcRed(c1.maxU1, c2.maxU1),

      u2_orig: (c1.maxU2 * 1000).toFixed(2),
      u2_mit: (c2.maxU2 * 1000).toFixed(2),
      u2_red: calcRed(c1.maxU2, c2.maxU2),

      drift1_orig: (c1.maxDrift1 * 100).toFixed(2),
      drift1_mit: (c2.maxDrift1 * 100).toFixed(2),
      drift1_red: calcRed(c1.maxDrift1, c2.maxDrift1),

      drift2_orig: (c1.maxDrift2 * 100).toFixed(2),
      drift2_mit: (c2.maxDrift2 * 100).toFixed(2),
      drift2_red: calcRed(c1.maxDrift2, c2.maxDrift2)
    };
  }

  drawInitialCanvases() {
    this.drawChart();
    this.drawDrifts();
  }

  /**
   * Gráfico 1: Desplazamiento Relativo de Cubierta vs Tiempo u(t)
   */
  drawChart() {
    if (!this.chartCtx || !this.chartCanvas) return;
    const ctx = this.chartCtx;
    const w = this.chartCanvas.width;
    const h = this.chartCanvas.height;

    ctx.fillStyle = '#0b1120';
    ctx.fillRect(0, 0, w, h);

    const midY = h / 2;
    ctx.beginPath();
    ctx.strokeStyle = '#334155';
    ctx.moveTo(40, midY);
    ctx.lineTo(w - 10, midY);
    ctx.stroke();

    // Escala vertical dinámica según amplitud de respuesta máxima
    const maxVal = Math.max(25, this.peaks.c1.maxU2 * 1000.0 * 1.25);
    const scaleY = (h * 0.42) / maxVal;

    [-maxVal * 0.75, maxVal * 0.75].forEach(val => {
      const y = midY - val * scaleY;
      ctx.beginPath();
      ctx.strokeStyle = '#1e293b';
      ctx.setLineDash([3, 3]);
      ctx.moveTo(40, y);
      ctx.lineTo(w - 10, y);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#64748b';
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${val.toFixed(0)}`, 36, y + 3);
    });

    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px "Inter", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Desplazamiento Cubierta u2 (mm)', 10, 14);
    ctx.textAlign = 'right';
    ctx.fillText('Tiempo t (s)', w - 10, h - 6);

    if (this.history.length < 2) return;

    const xStep = (w - 55) / this.maxHistoryPoints;
    const getX = (idx) => 45 + idx * xStep;
    const getY = (valMm) => midY - valMm * scaleY;

    // Curva 1: Caso 1: Sin Mitigación (Rojo / Alerta)
    ctx.beginPath();
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2.0;
    this.history.forEach((pt, i) => {
      const x = getX(i);
      const y = getY(pt.u2_1);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Curva 2: Caso 2: Mitigada con Diagonales en X (Verde Esmeralda)
    ctx.beginPath();
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 2.0;
    this.history.forEach((pt, i) => {
      const x = getX(i);
      const y = getY(pt.u2_2);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  /**
   * Gráfico 2: Perfil de Derivas de Entrepiso (% Drift) vs Límite NEC-15 (2.0%)
   */
  drawDrifts() {
    if (!this.driftCtx || !this.driftCanvas) return;
    const ctx = this.driftCtx;
    const w = this.driftCanvas.width;
    const h = this.driftCanvas.height;

    ctx.fillStyle = '#0b1120';
    ctx.fillRect(0, 0, w, h);

    const leftMargin = 55;
    const rightMargin = 20;
    const topMargin = 24;
    const chartW = w - leftMargin - rightMargin;

    const maxDriftScale = 0.030; // 3.0%
    const necLimit = 0.020;      // 2.0% Límite reglamentario NEC-SE-DS

    const getXFromDrift = (drift) => leftMargin + (Math.min(drift, maxDriftScale) / maxDriftScale) * chartW;

    [0.005, 0.010, 0.015, 0.020, 0.025].forEach(d => {
      const x = getXFromDrift(d);
      ctx.beginPath();
      ctx.strokeStyle = d === necLimit ? 'rgba(239, 68, 68, 0.8)' : '#1e293b';
      ctx.lineWidth = d === necLimit ? 2 : 1;
      if (d === necLimit) ctx.setLineDash([4, 3]);
      ctx.moveTo(x, topMargin);
      ctx.lineTo(x, h - 20);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = d === necLimit ? '#f87171' : '#64748b';
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${(d * 100).toFixed(1)}%`, x, h - 8);
    });

    const necX = getXFromDrift(necLimit);
    ctx.fillStyle = '#f87171';
    ctx.font = 'bold 9px "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('LÍMITE NEC-15 (2.0%)', necX, 14);

    // Derivas instantáneas para los 2 pisos
    const lastPt = this.history.length > 0 ? this.history[this.history.length - 1] : { d1_1: 0, d2_1: 0, d1_2: 0, d2_2: 0 };

    const stories = [
      { name: 'Piso 2', d1: lastPt.d2_1, d2: lastPt.d2_2, y: topMargin + 18 },
      { name: 'Piso 1', d1: lastPt.d1_1, d2: lastPt.d1_2, y: topMargin + 56 }
    ];

    const barHeight = 10;

    stories.forEach(st => {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px "Inter", sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(st.name, leftMargin - 8, st.y + barHeight);

      // Barra Caso 1
      const w1 = Math.max(2, (st.d1 / maxDriftScale) * chartW);
      ctx.fillStyle = st.d1 > necLimit ? '#ef4444' : '#f97316';
      ctx.fillRect(leftMargin, st.y, w1, barHeight);

      // Barra Caso 2
      const w2 = Math.max(2, (st.d2 / maxDriftScale) * chartW);
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(leftMargin, st.y + barHeight + 3, w2, barHeight);

      ctx.font = '8px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#fca5a5';
      ctx.fillText(`${(st.d1 * 100).toFixed(2)}%`, leftMargin + w1 + 4, st.y + 8);
      ctx.fillStyle = '#86efac';
      ctx.fillText(`${(st.d2 * 100).toFixed(2)}%`, leftMargin + w2 + 4, st.y + barHeight + 11);
    });
  }
}

// Exportar para Node o navegador
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DynamicSimulator;
}
