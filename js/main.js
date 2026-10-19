/**
 * main.js
 * Controlador Principal del Visor 3D y Dashboard Estructural
 * Edificio Comercial de 2 Niveles en Portoviejo (Croquis 31m x 28m)
 * Universidad Técnica de Manabí (UTM)
 */

document.addEventListener("DOMContentLoaded", () => {
  // 1. Configuración de la Escena Three.js
  const container = document.getElementById("canvas-container");
  let scene, camera, renderer, controls;
  let structuralEngine;
  let simulator;
  let activeTableKey = 'table_51';

  // Parámetros de animación y cámara
  let targetCameraPos = null;
  let targetCameraLookAt = null;
  let isCameraTransitioning = false;

  function initThree() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1120);
    scene.fog = new THREE.FogExp2(0x0b1120, 0.009);

    const aspect = container.clientWidth / container.clientHeight;
    camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
    camera.position.set(45, 32, 45);

    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    container.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 + 0.1;
    controls.minDistance = 5;
    controls.maxDistance = 200;
    controls.target.set(15.5, 3.0, 14.0);
    controls.update();

    setupLighting();
    setupEnvironment();

    structuralEngine = new StructuralEngine(scene);
    structuralEngine.rebuildModel();

    simulator = new DynamicSimulator(structuralEngine);
    simulator.initCanvases("canvas-time-history", "canvas-story-drifts");

    updateUIDiagnostics();
    updateScalingUI();

    window.addEventListener("resize", onWindowResize);
    animate();
  }

  function setupLighting() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
    scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(0x38bdf8, 0x1e293b, 0.45);
    hemiLight.position.set(0, 50, 0);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.95);
    dirLight.position.set(45, 55, 45);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 180;
    const shadowDist = 45;
    dirLight.shadow.camera.left = -shadowDist;
    dirLight.shadow.camera.right = shadowDist;
    dirLight.shadow.camera.top = shadowDist;
    dirLight.shadow.camera.bottom = -shadowDist;
    dirLight.shadow.bias = -0.0005;
    scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0x93c5fd, 0.4);
    fillLight.position.set(-45, 35, -30);
    scene.add(fillLight);
  }

  function setupEnvironment() {
    const gridHelper = new THREE.GridHelper(80, 80, 0x0284c7, 0x334155);
    gridHelper.position.y = -2.1;
    scene.add(gridHelper);

    const floorGeo = new THREE.PlaneGeometry(160, 160);
    const floorMat = new THREE.ShadowMaterial({ opacity: 0.35 });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = -2.11;
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);
  }

  function onWindowResize() {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  }

  function animate() {
    requestAnimationFrame(animate);

    if (simulator) {
      simulator.update(performance.now());
    }

    if (isCameraTransitioning && targetCameraPos && targetCameraLookAt) {
      camera.position.lerp(targetCameraPos, 0.08);
      controls.target.lerp(targetCameraLookAt, 0.08);
      controls.update();

      if (camera.position.distanceTo(targetCameraPos) < 0.1 &&
          controls.target.distanceTo(targetCameraLookAt) < 0.1) {
        camera.position.copy(targetCameraPos);
        controls.target.copy(targetCameraLookAt);
        controls.update();
        isCameraTransitioning = false;
      }
    } else {
      controls.update();
    }

    renderer.render(scene, camera);
  }

  function setCameraPreset(pos, target) {
    targetCameraPos = pos.clone();
    targetCameraLookAt = target.clone();
    isCameraTransitioning = true;
  }

  // 2. Vinculación de Controles de Interfaz y Módulos
  function setupUIListeners() {
    const p = structuralEngine.params;
    const centerPoint = () => new THREE.Vector3(p.Lx / 2, (p.numStories * p.storyHeight) / 2, p.Lz / 2);

    // Botones de Vistas de Cámara
    const btn3D = document.getElementById("view-3d");
    const btnTop = document.getElementById("view-top");
    const btnFront = document.getElementById("view-front");
    const btnSide = document.getElementById("view-side");
    const viewButtons = [btn3D, btnTop, btnFront, btnSide];

    function setActiveViewBtn(btn) {
      viewButtons.forEach(b => b.classList.remove("active"));
      if (btn) btn.classList.add("active");
    }

    btn3D.addEventListener("click", () => {
      setActiveViewBtn(btn3D);
      const c = centerPoint();
      setCameraPreset(new THREE.Vector3(p.Lx + 15, c.y + 22, p.Lz + 15), c);
    });

    btnTop.addEventListener("click", () => {
      setActiveViewBtn(btnTop);
      const c = centerPoint();
      setCameraPreset(new THREE.Vector3(c.x, Math.max(p.Lx, p.Lz) * 1.9, c.z), new THREE.Vector3(c.x, 0, c.z));
    });

    btnFront.addEventListener("click", () => {
      setActiveViewBtn(btnFront);
      const c = centerPoint();
      setCameraPreset(new THREE.Vector3(c.x, c.y, -p.Lz * 1.4), c);
    });

    btnSide.addEventListener("click", () => {
      setActiveViewBtn(btnSide);
      const c = centerPoint();
      setCameraPreset(new THREE.Vector3(-p.Lx * 1.4, c.y, c.z), c);
    });

    document.getElementById("btn-reset-view").addEventListener("click", () => {
      btn3D.click();
    });

    // Selector de Caso Estructural (Original vs Mitigado)
    const btnModeOriginal = document.getElementById("btn-mode-original");
    const btnModeMitigated = document.getElementById("btn-mode-mitigated");

    btnModeOriginal.addEventListener("click", () => {
      btnModeOriginal.classList.add("active-original");
      btnModeMitigated.classList.remove("active-mitigated");
      structuralEngine.updateParameters({ isMitigated: false });
      updateUIDiagnostics();
    });

    btnModeMitigated.addEventListener("click", () => {
      btnModeMitigated.classList.add("active-mitigated");
      btnModeOriginal.classList.remove("active-original");
      structuralEngine.updateParameters({ isMitigated: true });
      updateUIDiagnostics();
    });

    // Vinculación bidireccional Slider <-> Input Numérico
    function bindInput(sliderId, inputId, paramKey, scale = 1.0) {
      const slider = document.getElementById(sliderId);
      const numInput = document.getElementById(inputId);

      function handleChange(val) {
        let numVal = parseFloat(val);
        if (isNaN(numVal)) return;

        slider.value = numVal;
        numInput.value = numVal;

        const updates = {};
        updates[paramKey] = numVal / scale;
        structuralEngine.updateParameters(updates);
        if (simulator) simulator.reset();
        updateUIDiagnostics();
        updateScalingUI();
      }

      slider.addEventListener("input", (e) => handleChange(e.target.value));
      numInput.addEventListener("change", (e) => handleChange(e.target.value));
    }

    bindInput("slider-Lx", "input-Lx", "Lx");
    bindInput("slider-Lz", "input-Lz", "Lz");
    bindInput("slider-wSup", "input-wSup", "wSup");
    bindInput("slider-wInf", "input-wInf", "wInf");
    bindInput("slider-story-h", "input-story-h", "storyHeight");

    bindInput("slider-col-dim", "input-col-dim", "colWidth", 100);
    document.getElementById("slider-col-dim").addEventListener("input", (e) => {
      structuralEngine.params.colDepth = parseFloat(e.target.value) / 100;
    });

    bindInput("slider-beam-h", "input-beam-h", "beamHeight", 100);
    bindInput("slider-beam-w", "input-beam-w", "beamWidth", 100);
    bindInput("slider-slab-e", "input-slab-e", "slabThickness", 100);

    // Botón de Restablecer Valores por Defecto (Portoviejo 31 x 28 m)
    document.getElementById("btn-reset-defaults").addEventListener("click", () => {
      document.getElementById("slider-Lx").value = 31;
      document.getElementById("input-Lx").value = 31;
      document.getElementById("slider-Lz").value = 28;
      document.getElementById("input-Lz").value = 28;
      document.getElementById("slider-wSup").value = 11;
      document.getElementById("input-wSup").value = 11;
      document.getElementById("slider-wInf").value = 10;
      document.getElementById("input-wInf").value = 10;
      document.getElementById("slider-story-h").value = 3.0;
      document.getElementById("input-story-h").value = 3.0;
      document.getElementById("slider-col-dim").value = 45;
      document.getElementById("input-col-dim").value = 45;
      document.getElementById("slider-beam-h").value = 45;
      document.getElementById("input-beam-h").value = 45;
      document.getElementById("slider-beam-w").value = 30;
      document.getElementById("input-beam-w").value = 30;
      document.getElementById("slider-slab-e").value = 20;
      document.getElementById("input-slab-e").value = 20;

      structuralEngine.updateParameters({
        Lx: 31.0,
        Lz: 28.0,
        wSup: 11.0,
        wInf: 10.0,
        a: 20.0,
        b: 18.0,
        storyHeight: 3.0,
        colWidth: 0.45,
        colDepth: 0.45,
        beamHeight: 0.45,
        beamWidth: 0.30,
        slabThickness: 0.20
      });
      if (simulator) simulator.reset();
      updateUIDiagnostics();
      updateScalingUI();
    });

    // Alternadores de Capas 3D
    function bindLayer(checkboxId, paramKey) {
      const chk = document.getElementById(checkboxId);
      chk.addEventListener("change", (e) => {
        structuralEngine.params[paramKey] = e.target.checked;
        structuralEngine.applyLayerVisibility();
      });
    }

    bindLayer("layer-slabs", "showSlabs");
    bindLayer("layer-beams", "showBeams");
    bindLayer("layer-columns", "showColumns");
    bindLayer("layer-foundations", "showFoundations");
    bindLayer("layer-dimensions", "showDimensions");
    bindLayer("layer-axes", "showAxes");
    bindLayer("layer-markers", "showMarkers");

    document.getElementById("layer-hotspot").addEventListener("change", (e) => {
      structuralEngine.params.showStressHotspot = e.target.checked;
      structuralEngine.rebuildModel();
      updateUIDiagnostics();
    });

    // Colapsar y expandir paneles laterales
    const sidebarLeft = document.getElementById("sidebar-left");
    const sidebarRight = document.getElementById("sidebar-right");
    const triggerLeft = document.getElementById("trigger-left");
    const triggerRight = document.getElementById("trigger-right");

    document.getElementById("close-left").addEventListener("click", () => {
      sidebarLeft.classList.add("sidebar-collapsed-left");
      triggerLeft.style.display = "flex";
    });

    triggerLeft.addEventListener("click", () => {
      sidebarLeft.classList.remove("sidebar-collapsed-left");
      triggerLeft.style.display = "none";
    });

    document.getElementById("close-right").addEventListener("click", () => {
      sidebarRight.classList.add("sidebar-collapsed-right");
      triggerRight.style.display = "flex";
    });

    triggerRight.addEventListener("click", () => {
      sidebarRight.classList.remove("sidebar-collapsed-right");
      triggerRight.style.display = "none";
    });

    // Captura de Pantalla HD
    document.getElementById("btn-screenshot").addEventListener("click", () => {
      renderer.render(scene, camera);
      const dataURL = renderer.domElement.toDataURL("image/png");
      const link = document.createElement("a");
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      link.download = `Maqueta_3D_UTM_Irregularidad_Tipo2_${timestamp}.png`;
      link.href = dataURL;
      link.click();
    });

    // --- MODALES ---
    function setupModal(triggerId, modalId, closeId, okId) {
      const modal = document.getElementById(modalId);
      const btnTrigger = document.getElementById(triggerId);
      const btnClose = document.getElementById(closeId);
      const btnOk = okId ? document.getElementById(okId) : null;

      if (btnTrigger && modal) {
        btnTrigger.addEventListener("click", () => modal.classList.add("active"));
      }
      if (btnClose && modal) {
        btnClose.addEventListener("click", () => modal.classList.remove("active"));
      }
      if (btnOk && modal) {
        btnOk.addEventListener("click", () => modal.classList.remove("active"));
      }
    }

    setupModal("btn-info", "info-modal", "close-modal-btn", "btn-modal-entendido");
    setupModal("btn-theory", "theory-modal", "close-theory-btn", "btn-theory-entendido");
    setupModal("btn-charac", "charac-modal", "close-charac-btn", "btn-charac-entendido");
    setupModal("btn-scaling", "scaling-modal", "close-scaling-btn", "btn-scaling-entendido");

    // Modal de Resultados Comparativos
    const resultsModal = document.getElementById("results-modal");
    const openResultsHandler = () => {
      updateResultsTableUI();
      resultsModal.classList.add("active");
    };
    document.getElementById("btn-results").addEventListener("click", openResultsHandler);
    document.getElementById("btn-st-open-results").addEventListener("click", openResultsHandler);
    document.getElementById("close-results-btn").addEventListener("click", () => resultsModal.classList.remove("active"));
    document.getElementById("btn-results-entendido").addEventListener("click", () => resultsModal.classList.remove("active"));

    // Exportación CSV
    document.getElementById("btn-st-export-csv").addEventListener("click", () => {
      if (!simulator.exportCSV()) {
        alert("Primero ejecuta el ensayo dinámico unos segundos para generar datos de simulación.");
      }
    });
    document.getElementById("btn-export-csv-modal").addEventListener("click", () => {
      if (!simulator.exportCSV()) {
        alert("Primero ejecuta el ensayo dinámico unos segundos para generar datos de simulación.");
      }
    });

    // --- CONTROLES DE ESCALAMIENTO (Módulo 4 y 5) ---
    const btnTable51 = document.getElementById("btn-choice-table51");
    const btnTable76 = document.getElementById("btn-choice-table76");
    const inputMargin = document.getElementById("input-scale-margin");

    btnTable51.addEventListener("click", () => {
      btnTable51.classList.add("active");
      btnTable76.classList.remove("active");
      activeTableKey = 'table_51';
      updateScalingUI();
    });

    btnTable76.addEventListener("click", () => {
      btnTable76.classList.add("active");
      btnTable51.classList.remove("active");
      activeTableKey = 'table_76';
      updateScalingUI();
    });

    inputMargin.addEventListener("change", updateScalingUI);
    inputMargin.addEventListener("input", updateScalingUI);

    // --- CONTROLES DE LA MESA VIBRATORIA VIRTUAL ---
    const shakeTablePanel = document.getElementById("shake-table-panel");
    const triggerShakeTable = document.getElementById("trigger-shake-table");
    const btnToggleST = document.getElementById("btn-toggle-shake-table");
    const btnMinimizeST = document.getElementById("btn-st-minimize");

    function expandShakeTablePanel() {
      shakeTablePanel.classList.remove("panel-minimized");
      triggerShakeTable.style.display = "none";
    }

    function minimizeShakeTablePanel() {
      shakeTablePanel.classList.add("panel-minimized");
      triggerShakeTable.style.display = "flex";
    }

    triggerShakeTable.addEventListener("click", expandShakeTablePanel);
    btnToggleST.addEventListener("click", () => {
      if (shakeTablePanel.classList.contains("panel-minimized")) {
        expandShakeTablePanel();
      } else {
        minimizeShakeTablePanel();
      }
    });
    btnMinimizeST.addEventListener("click", minimizeShakeTablePanel);

    document.getElementById("btn-st-play").addEventListener("click", () => {
      expandShakeTablePanel();
      simulator.start();
    });

    document.getElementById("btn-st-pause").addEventListener("click", () => {
      simulator.pause();
    });

    document.getElementById("btn-st-reset").addEventListener("click", () => {
      simulator.reset();
      updateUIDiagnostics();
    });

    // Modalidades de Excitación
    const btnHarmonic = document.getElementById("st-mode-harmonic");
    const btnSweep = document.getElementById("st-mode-sweep");
    const btnRecord = document.getElementById("st-mode-record");
    const rowFreq = document.getElementById("row-st-freq");

    function setActiveMode(mode, activeBtn) {
      [btnHarmonic, btnSweep, btnRecord].forEach(b => b.classList.remove("active"));
      activeBtn.classList.add("active");
      simulator.params.mode = mode;
      simulator.reset();

      if (mode === 'harmonic') rowFreq.style.display = 'flex';
      else if (mode === 'sweep') rowFreq.style.display = 'none';
      else if (mode === 'record') rowFreq.style.display = 'none';
    }

    btnHarmonic.addEventListener("click", () => setActiveMode('harmonic', btnHarmonic));
    btnSweep.addEventListener("click", () => setActiveMode('sweep', btnSweep));
    btnRecord.addEventListener("click", () => setActiveMode('record', btnRecord));

    // Carga de archivo CSV
    const fileCsvInput = document.getElementById("st-file-csv");
    const fileCsvLabel = document.getElementById("st-csv-filename");

    fileCsvInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const res = simulator.loadCustomCSV(event.target.result);
        if (res.success) {
          fileCsvLabel.textContent = `${file.name} (${res.count} pts)`;
          [btnHarmonic, btnSweep, btnRecord].forEach(b => b.classList.remove("active"));
          simulator.reset();
          alert(`¡Archivo sísmico cargado exitosamente!\nPuntos: ${res.count}\ndt: ${res.dt.toFixed(3)} s\nPGA: ${res.pga.toFixed(3)} m/s²`);
        } else {
          alert(`Error al procesar archivo CSV: ${res.error}`);
        }
      };
      reader.readAsText(file);
    });

    // Sliders de Excitación
    const sliderFreq = document.getElementById("st-slider-freq");
    const valFreq = document.getElementById("st-val-freq");
    sliderFreq.addEventListener("input", (e) => {
      const f = parseFloat(e.target.value);
      simulator.params.frequency = f;
      valFreq.textContent = `${f.toFixed(2)} Hz`;
    });

    document.querySelectorAll(".preset-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const f = parseFloat(btn.dataset.freq);
        sliderFreq.value = f;
        simulator.params.frequency = f;
        valFreq.textContent = `${f.toFixed(2)} Hz`;
      });
    });

    const sliderAmp = document.getElementById("st-slider-amp");
    const valAmp = document.getElementById("st-val-accel");
    sliderAmp.addEventListener("input", (e) => {
      const gFraction = parseFloat(e.target.value);
      const ms2 = gFraction * 9.80665;
      simulator.params.accelAmpG = gFraction;
      simulator.params.accelAmpMs2 = ms2;
      valAmp.textContent = `${gFraction.toFixed(2)} g (${ms2.toFixed(2)} m/s²)`;
    });

    // Dirección Sísmica
    const dirButtons = [
      { id: 'st-dir-x', dir: 'X' },
      { id: 'st-dir-z', dir: 'Z' },
      { id: 'st-dir-xz', dir: 'XZ' }
    ];

    dirButtons.forEach(item => {
      const btn = document.getElementById(item.id);
      btn.addEventListener("click", () => {
        dirButtons.forEach(b => document.getElementById(b.id).classList.remove("active"));
        btn.classList.add("active");
        simulator.params.direction = item.dir;
      });
    });
  }

  // 3. Actualización de Métricas de Ingeniería y Diagnóstico NEC-15
  function updateUIDiagnostics() {
    if (!structuralEngine || !structuralEngine.analysisResults) return;

    const res = structuralEngine.analysisResults;
    const { irregularity, CM, CR, eccentricity, ecc_original, isMitigated } = res;
    const p = structuralEngine.params;

    const totalH = p.numStories * p.storyHeight;
    document.getElementById("label-total-height").textContent = `${totalH.toFixed(2)} m`;
    document.getElementById("label-reentrant-dims").textContent = `${p.a.toFixed(1)} m × ${p.b.toFixed(1)} m`;

    document.getElementById("val-ratio-x").textContent = `${irregularity.ratioXPercent}%`;
    document.getElementById("val-ratio-z").textContent = `${irregularity.ratioZPercent}%`;
    document.getElementById("val-phi-p2").textContent = irregularity.phi_p2.toFixed(2);

    const badgeStatus = document.getElementById("badge-irregularity-status");
    if (irregularity.isIrregularType2) {
      badgeStatus.className = "diagnosis-badge badge-irregular";
      badgeStatus.textContent = "TIPO 2: IRREGULAR (NEC)";
    } else {
      badgeStatus.className = "diagnosis-badge badge-regular";
      badgeStatus.textContent = "PLANTA REGULAR";
    }

    document.getElementById("val-area-total").textContent = `${CM.area.toFixed(0)} m²`;
    document.getElementById("val-area-pct").textContent = `${CM.areaEfficiency.toFixed(1)}% del área bruta`;

    const valEcc = document.getElementById("val-eccentricity");
    const valEccSub = document.getElementById("val-ecc-sub");
    const valMitState = document.getElementById("val-mitigation-state");
    const torsionExp = document.getElementById("torsion-explanation");

    valEcc.textContent = `${eccentricity.torsionalArm} m`;

    if (isMitigated) {
      valMitState.textContent = "Mitigado con Diagonales en X";
      valMitState.style.color = "#22c55e";
      valEccSub.textContent = `Reducido desde ${ecc_original.torsionalArm} m original`;

      torsionExp.innerHTML = `
        <strong><i class="fa-solid fa-shield-check" style="color: var(--accent-green);"></i> Mitigación Efectiva:</strong>
        Las diagonales en X perimetrales rigidizan las alas exteriores y trasladan el Centro de Rigideces (CR) hacia el Centro de Masas (CM), reduciendo drásticamente el momento torsor y las derivas de entrepiso.
      `;
    } else {
      valMitState.textContent = "Sin Arriostrar (Original)";
      valMitState.style.color = "#f87171";
      valEccSub.textContent = `Excentricidad estática e = ${eccentricity.torsionalArm} m`;

      torsionExp.innerHTML = `
        <strong><i class="fa-solid fa-triangle-exclamation" style="color: var(--accent-orange);"></i> Patología Sísmica:</strong>
        El retroceso de 20 m × 18 m genera una asimetría pronunciada. El Centro de Masas (CM) se desalinea del Centro de Rigidez (CR), induciendo momentos torsores elevados que sobrecargan las columnas del vértice entrante.
      `;
    }
  }

  // 4. Actualización del Módulo de Escalamiento y Materiales Comerciales (Módulos 4 y 5)
  function updateScalingUI() {
    if (!structuralEngine) return;
    const p = structuralEngine.params;
    const marginCm = parseFloat(document.getElementById("input-scale-margin").value) || 3.0;

    const res = ScalingEngine.computeScaling({
      realLx: p.Lx,
      realLz: p.Lz,
      realH: p.numStories * p.storyHeight,
      wInf: p.wInf,
      wSup: p.wSup,
      colDimM: p.colWidth,
      beamHeightM: p.beamHeight,
      beamWidthM: p.beamWidth,
      slabThickM: p.slabThickness,
      tableKey: activeTableKey,
      marginCm: marginCm
    });

    document.getElementById("lbl-scale-factor").textContent = res.scaleRatioText;
    document.getElementById("lbl-free-space").textContent = `${res.clearance.freeMarginX} cm X / ${res.clearance.freeMarginZ} cm Z`;

    const warnContainer = document.getElementById("scaling-warnings-container");
    warnContainer.innerHTML = "";
    if (res.warnings.length > 0) {
      res.warnings.forEach(w => {
        const div = document.createElement("div");
        div.className = "warning-box";
        div.style.marginBottom = "6px";
        div.style.padding = "6px 8px";
        div.innerHTML = `<i class="fa-solid fa-triangle-exclamation warning-icon"></i><div class="warning-text">${w}</div>`;
        warnContainer.appendChild(div);
      });
    }

    const tBody = document.getElementById("scaling-table-body");
    tBody.innerHTML = `
      <tr><td>Largo Total X</td><td>${res.real.Lx.toFixed(2)} m</td><td><strong>${res.scaled.LxCm} cm</strong></td></tr>
      <tr><td>Largo Total Z</td><td>${res.real.Lz.toFixed(2)} m</td><td><strong>${res.scaled.LzCm} cm</strong></td></tr>
      <tr><td>Altura Total H</td><td>${res.real.H.toFixed(2)} m</td><td><strong>${res.scaled.HCm} cm</strong></td></tr>
      <tr><td>Brazo Superior (wSup)</td><td>${res.real.wSup.toFixed(2)} m</td><td><strong>${res.scaled.wSupCm} cm</strong></td></tr>
      <tr><td>Brazo Inferior (wInf)</td><td>${res.real.wInf.toFixed(2)} m</td><td><strong>${res.scaled.wInfCm} cm</strong></td></tr>
      <tr><td>Entrante a × b</td><td>${res.real.a.toFixed(1)} × ${res.real.b.toFixed(1)} m</td><td><strong>${res.scaled.aCm} × ${res.scaled.bCm} cm</strong></td></tr>
      <tr><td>Columnas (cx = cz)</td><td>${(res.real.colDimM * 100).toFixed(0)} cm</td><td><strong>${res.scaled.colMm} mm</strong></td></tr>
      <tr><td>Vigas (bv × hv)</td><td>${(res.real.beamWidthM * 100).toFixed(0)} × ${(res.real.beamHeightM * 100).toFixed(0)} cm</td><td><strong>${res.scaled.beamWMm} × ${res.scaled.beamHMm} mm</strong></td></tr>
      <tr><td>Espesor Losa (e)</td><td>${(res.real.slabThickM * 100).toFixed(0)} cm</td><td><strong>${res.scaled.slabMm} mm</strong></td></tr>
    `;

    const cBody = document.getElementById("commercial-table-body");
    cBody.innerHTML = "";
    res.commercialComparison.forEach(row => {
      const isPos = row.diffPct.startsWith('+');
      const tagClass = isPos ? 'diff-tag-pos' : 'diff-tag-neg';
      cBody.innerHTML += `
        <tr>
          <td><strong>${row.element}</strong></td>
          <td>${row.idealText}</td>
          <td>${row.commercialText}</td>
          <td>${row.commercialVal}</td>
          <td>${row.diffAbs}</td>
          <td class="${tagClass}">${row.diffPct}</td>
          <td>${row.pieceLength}</td>
          <td>${row.estimatedCount}</td>
        </tr>
      `;
    });
  }

  // 5. Actualización de la Tabla de Resultados Comparativos (Módulo 11)
  function updateResultsTableUI() {
    if (!simulator) return;
    const sum = simulator.getComparisonSummary();
    const tBody = document.getElementById("results-table-body");

    function renderRedCell(valText) {
      if (valText === "No calculable") return `<td class="val-red-cell">No calculable</td>`;
      const isPos = valText.startsWith('+');
      const cls = isPos ? 'red-positive' : 'red-negative';
      return `<td class="val-red-cell ${cls}">${valText}</td>`;
    }

    tBody.innerHTML = `
      <tr>
        <td class="element-name">Frecuencia Fundamental (f1)</td>
        <td class="val-orig-cell">${sum.f1_orig}</td>
        <td class="val-mit-cell">${sum.f1_mit}</td>
        <td>Modo 1 de traslación</td>
        <td>Rigidización efectiva</td>
      </tr>
      <tr>
        <td class="element-name">Frecuencia Segundo Modo (f2)</td>
        <td class="val-orig-cell">${sum.f2_orig}</td>
        <td class="val-mit-cell">${sum.f2_mit}</td>
        <td>Modo 2 de traslación</td>
        <td>Respuesta de 2 GDL</td>
      </tr>
      <tr>
        <td class="element-name">Desplazamiento Máx. Piso 1 (u1)</td>
        <td class="val-orig-cell">${sum.u1_orig} mm</td>
        <td class="val-mit-cell">${sum.u1_mit} mm</td>
        ${renderRedCell(sum.u1_red)}
        <td>Control de deformación</td>
      </tr>
      <tr>
        <td class="element-name">Desplazamiento Máx. Cubierta (u2)</td>
        <td class="val-orig-cell">${sum.u2_orig} mm</td>
        <td class="val-mit-cell">${sum.u2_mit} mm</td>
        ${renderRedCell(sum.u2_red)}
        <td>Deriva acumulada</td>
      </tr>
      <tr>
        <td class="element-name">Deriva Máxima Entrepiso 1 (&Delta;1 / h)</td>
        <td class="val-orig-cell">${sum.drift1_orig}%</td>
        <td class="val-mit-cell">${sum.drift1_mit}%</td>
        ${renderRedCell(sum.drift1_red)}
        <td>${parseFloat(sum.drift1_orig) > 2.0 ? '<strong style="color:#ef4444;">EXCEDE (2.0%)</strong>' : '<span style="color:#22c55e;">OK (< 2.0%)</span>'}</td>
      </tr>
      <tr>
        <td class="element-name">Deriva Máxima Entrepiso 2 (&Delta;2 / h)</td>
        <td class="val-orig-cell">${sum.drift2_orig}%</td>
        <td class="val-mit-cell">${sum.drift2_mit}%</td>
        ${renderRedCell(sum.drift2_red)}
        <td>${parseFloat(sum.drift2_orig) > 2.0 ? '<strong style="color:#ef4444;">EXCEDE (2.0%)</strong>' : '<span style="color:#22c55e;">OK (< 2.0%)</span>'}</td>
      </tr>
    `;
  }

  // Inicializar todo
  initThree();
  setupUIListeners();
});
