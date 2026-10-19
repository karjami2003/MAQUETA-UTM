/**
 * structural-engine.js
 * Generador Paramétrico 3D de Estructura Sismorresistente con Irregularidad Tipo 2
 * Caso de Estudio: Edificio Comercial de 2 Niveles en Portoviejo (Croquis 31m x 28m en «L»)
 * Incluye Mesa Vibratoria Virtual para Ensayos Dinámicos
 * Universidad Técnica de Manabí (UTM) - Facultad de Ciencias Matemáticas, Físicas y Químicas
 */

class StructuralEngine {
  constructor(scene) {
    this.scene = scene;
    this.rootGroup = new THREE.Group();
    this.rootGroup.name = "StructuralModel";
    this.scene.add(this.rootGroup);

    // Subgrupos organizados por niveles para cinemática dinámica de mesa vibratoria
    // storyGroups[0]: Base (Mesa Vibratoria + Cimentación y Zapatas)
    // storyGroups[1]: Nivel 1 (Piso 1: Vigas, Losa y Diagonales Nivel 1)
    // storyGroups[2]: Nivel 2 (Piso 2 / Cubierta: Vigas, Losa y Diagonales Nivel 2)
    // storyGroups[3]: Nivel adicional de reserva (si se ajustara a 3 pisos)
    this.storyGroups = [
      new THREE.Group(),
      new THREE.Group(),
      new THREE.Group(),
      new THREE.Group()
    ];
    this.storyGroups.forEach((g, idx) => {
      g.name = `StoryLevel_${idx}`;
      this.rootGroup.add(g);
    });

    // Subgrupos para elementos de referencia y columnas
    this.columnsGroup = new THREE.Group();
    this.dimensionsGroup = new THREE.Group();
    this.axesGroup = new THREE.Group();
    this.markersGroup = new THREE.Group();

    this.rootGroup.add(this.columnsGroup);
    this.rootGroup.add(this.dimensionsGroup);
    this.rootGroup.add(this.axesGroup);
    this.rootGroup.add(this.markersGroup);

    // Parámetros por defecto: EDIFICIO COMERCIAL DE 2 PISOS EN PORTOVIEJO
    this.params = {
      // Datos geométricos del croquis de Portoviejo
      Lx: 31.0,              // Largo horizontal total en croquis (m)
      Lz: 28.0,              // Largo vertical total en croquis (m)
      wInf: 10.0,            // Ancho indicado del brazo inferior (m)
      wSup: 11.0,            // Ancho indicado del brazo superior (m)
      a: 20.0,               // Ancho del entrante en X = Lx - wSup (m) -> 64.5%
      b: 18.0,               // Profundidad del entrante en Z = Lz - wInf (m) -> 64.3%
      baysX1: 2,             // Número de vanos en brazo superior (ancho 11m -> 5.5m c/u)
      baysX2: 4,             // Número de vanos en recorte (largo 20m -> 5.0m c/u)
      baysZ1: 2,             // Número de vanos en brazo inferior (prof. 10m -> 5.0m c/u)
      baysZ2: 3,             // Número de vanos en recorte vertical (largo 18m -> 6.0m c/u)
      numStories: 2,         // 2 pisos según inmueble comercial de Portoviejo
      storyHeight: 3.0,      // Altura estimada por entrepiso (m) -> Total 6.00 m
      colWidth: 0.45,        // Sección columna en X (m) - 45 cm
      colDepth: 0.45,        // Sección columna en Z (m) - 45 cm
      beamWidth: 0.30,       // Base de vigas (m) - 30 cm
      beamHeight: 0.45,      // Peralte de vigas (m) - 45 cm
      slabThickness: 0.20,   // Espesor de losa (m) - 20 cm
      footingWidth: 1.60,    // Base de zapata (m)
      footingHeight: 0.45,   // Peralte de zapata (m)
      isMitigated: false,    // Caso 1: Original | Caso 2: Mitigada con Diagonales en X
      showSlabs: true,
      showBeams: true,
      showColumns: true,
      showFoundations: true,
      showDimensions: true,
      showAxes: true,
      showMarkers: true,
      showStressHotspot: true,
      showShakeTable: true
    };

    // Materiales PBR y de visualización técnica
    this.initMaterials();

    // Cache de elementos calculados
    this.columnsData = [];
    this.columnMeshes = []; // { mesh, story, origX, origY, origZ }
    this.bracesData = [];
    this.analysisResults = null;
  }

  initMaterials() {
    // Hormigón para columnas
    this.matColumn = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.75,
      metalness: 0.15
    });

    // Hormigón para vigas
    this.matBeam = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      roughness: 0.8,
      metalness: 0.1
    });

    // Losa translúcida con tono azul acero de ingeniería
    this.matSlab = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.55,
      roughness: 0.4,
      metalness: 0.2,
      side: THREE.DoubleSide
    });

    // Zapatas de cimentación
    this.matFooting = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.9,
      metalness: 0.05
    });

    // Mesa Vibratoria (Acero estructural industrial)
    this.matShakeTable = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.5,
      metalness: 0.8
    });

    // Bordes de seguridad de la mesa vibratoria (Franjas amarillas / precaución)
    this.matCautionBorder = new THREE.MeshStandardMaterial({
      color: 0xeab308,
      roughness: 0.4,
      metalness: 0.3
    });

    // Actuadores hidráulicos (Cromo pulido / acero metálico)
    this.matActuator = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.2,
      metalness: 0.9
    });

    // Acero estructural para arriostramientos en X (Naranja vibrante de seguridad)
    this.matBrace = new THREE.MeshStandardMaterial({
      color: 0xf97316,
      roughness: 0.35,
      metalness: 0.85,
      emissive: 0x7c2d12,
      emissiveIntensity: 0.3
    });

    // Vértice crítico de concentración de esfuerzos (Rojo pulsante)
    this.matHotspot = new THREE.MeshBasicMaterial({
      color: 0xef4444,
      transparent: true,
      opacity: 0.85,
      wireframe: false
    });

    // Material para líneas de cota
    this.matDimensionLine = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      linewidth: 2
    });

    // Material para vector de excentricidad
    this.matEccentricity = new THREE.LineDashedMaterial({
      color: 0xfbbf24,
      linewidth: 3,
      scale: 1,
      dashSize: 0.5,
      gapSize: 0.25
    });
  }

  /**
   * Actualiza parámetros y regenera la geometría completa
   */
  updateParameters(newParams) {
    this.params = { ...this.params, ...newParams };

    // Sincronizar dimensiones derivadas del croquis
    if (newParams.wSup !== undefined) {
      this.params.a = this.params.Lx - this.params.wSup;
    } else if (newParams.a !== undefined) {
      this.params.wSup = this.params.Lx - this.params.a;
    }

    if (newParams.wInf !== undefined) {
      this.params.b = this.params.Lz - this.params.wInf;
    } else if (newParams.b !== undefined) {
      this.params.wInf = this.params.Lz - this.params.b;
    }

    this.rebuildModel();
  }

  /**
   * Limpia todos los subgrupos de la escena
   */
  clearAllGroups() {
    this.storyGroups.forEach(group => {
      while (group.children.length > 0) {
        const obj = group.children[0];
        if (obj.geometry) obj.geometry.dispose();
        group.remove(obj);
      }
      group.position.set(0, 0, 0);
      group.rotation.set(0, 0, 0);
    });

    const otherGroups = [
      this.columnsGroup,
      this.dimensionsGroup,
      this.axesGroup,
      this.markersGroup
    ];

    otherGroups.forEach(group => {
      while (group.children.length > 0) {
        const obj = group.children[0];
        if (obj.geometry) obj.geometry.dispose();
        group.remove(obj);
      }
    });

    this.columnsData = [];
    this.columnMeshes = [];
    this.bracesData = [];
  }

  /**
   * Reconstruye el modelo estructural en 3D
   */
  rebuildModel() {
    this.clearAllGroups();

    const {
      Lx, Lz, a, b,
      baysX1, baysX2, baysZ1, baysZ2,
      numStories, storyHeight,
      colWidth, colDepth,
      beamWidth, beamHeight,
      slabThickness,
      footingWidth, footingHeight,
      isMitigated
    } = this.params;

    // 1. Determinar coordenadas de grilla garantizando nodo en el vértice entrante (Lx - a, Lz - b)
    const cornerX = Lx - a; // = wSup (11 m por defecto)
    const cornerZ = Lz - b; // = wInf (10 m por defecto)

    // Coordenadas en X
    const xCoords = [];
    // Tramo 1: 0 a cornerX
    const stepX1 = cornerX / baysX1;
    for (let i = 0; i <= baysX1; i++) {
      xCoords.push(i * stepX1);
    }
    // Tramo 2: cornerX a Lx
    const stepX2 = a / baysX2;
    for (let i = 1; i <= baysX2; i++) {
      xCoords.push(cornerX + i * stepX2);
    }

    // Coordenadas en Z
    const zCoords = [];
    // Tramo 1: 0 a cornerZ
    const stepZ1 = cornerZ / baysZ1;
    for (let j = 0; j <= baysZ1; j++) {
      zCoords.push(j * stepZ1);
    }
    // Tramo 2: cornerZ a Lz
    const stepZ2 = b / baysZ2;
    for (let j = 1; j <= baysZ2; j++) {
      zCoords.push(cornerZ + j * stepZ2);
    }

    // 2. Identificar qué nodos pertenecen a la forma en L
    // Un nodo está estrictamente fuera si x > cornerX + 0.02 && z > cornerZ + 0.02
    const validNodes = [];
    const nodeMap = {};

    for (let i = 0; i < xCoords.length; i++) {
      const x = xCoords[i];
      for (let j = 0; j < zCoords.length; j++) {
        const z = zCoords[j];
        const isCutout = (x > cornerX + 0.02) && (z > cornerZ + 0.02);
        if (!isCutout) {
          validNodes.push({ i, j, x, z });
          nodeMap[`${i}_${j}`] = { x, z, i, j };
        }
      }
    }

    this.columnsData = validNodes;

    // 3. Construir Mesa Vibratoria y Zapatas de Cimentación (Nivel 0)
    this.buildShakeTableAndFoundations(validNodes, Lx, Lz, footingWidth, footingHeight, colWidth, colDepth);

    // 4. Construir Columnas (2 pisos)
    this.buildColumns(validNodes, numStories, storyHeight, colWidth, colDepth);

    // 5. Construir Vigas en cada entrepiso (Nivel 1 y Nivel 2)
    this.buildBeams(nodeMap, xCoords.length - 1, zCoords.length - 1, numStories, storyHeight, beamWidth, beamHeight);

    // 6. Construir Losas de entrepiso y cubierta (Nivel 1 y Nivel 2)
    this.buildSlabs(Lx, Lz, a, b, numStories, storyHeight, slabThickness);

    // 7. Construir Sistema de Mitigación (Arriostramientos concéntricos en X)
    if (isMitigated) {
      this.buildMitigationBraces(nodeMap, xCoords.length - 1, zCoords.length - 1, baysX1, baysZ1, numStories, storyHeight);
    }

    // 8. Cálculos normativos NEC-15 (CM, CR, Excentricidad)
    this.calculateStructuralPhysics();

    // 9. Construir Marcadores (CM, CR, Vértice Crítico)
    if (this.params.showMarkers) {
      this.buildAnalysisMarkers(numStories * storyHeight);
    }

    // 10. Construir Cotas y Dimensiones 3D
    if (this.params.showDimensions) {
      this.buildDimensions(Lx, Lz, a, b, numStories, storyHeight);
    }

    // 11. Construir Ejes Estructurales
    if (this.params.showAxes) {
      this.buildStructuralAxes(xCoords, zCoords);
    }

    // Aplicar visibilidad de capas
    this.applyLayerVisibility();
  }

  /**
   * Construye la Mesa Vibratoria de Laboratorio y las zapatas de cimentación
   */
  buildShakeTableAndFoundations(nodes, Lx, Lz, fWidth, fHeight, cWidth, cDepth) {
    const baseGroup = this.storyGroups[0];

    // Plataforma de la Mesa Vibratoria Virtual
    const tablePadding = 3.0;
    const tableW = Lx + tablePadding * 2;
    const tableD = Lz + tablePadding * 2;
    const tableThickness = 0.50;
    const tableY = -fHeight - 0.5 - tableThickness / 2;

    const tableGeo = new THREE.BoxGeometry(tableW, tableThickness, tableD);
    const tableMesh = new THREE.Mesh(tableGeo, this.matShakeTable);
    tableMesh.position.set(Lx / 2, tableY, Lz / 2);
    tableMesh.receiveShadow = true;
    tableMesh.castShadow = true;
    tableMesh.userData.type = 'shaketable';
    baseGroup.add(tableMesh);

    // Bordes perimetrales de advertencia (Franjas amarillas de laboratorio)
    const borderThickness = 0.20;
    const borderHeight = 0.10;
    const borderGeoX = new THREE.BoxGeometry(tableW, borderHeight, borderThickness);
    const borderGeoZ = new THREE.BoxGeometry(borderThickness, borderHeight, tableD);

    const bSouth = new THREE.Mesh(borderGeoX, this.matCautionBorder);
    bSouth.position.set(Lx / 2, tableY + tableThickness / 2 + borderHeight / 2, -tablePadding + borderThickness / 2);
    bSouth.userData.type = 'shaketable';
    baseGroup.add(bSouth);

    const bNorth = new THREE.Mesh(borderGeoX, this.matCautionBorder);
    bNorth.position.set(Lx / 2, tableY + tableThickness / 2 + borderHeight / 2, Lz + tablePadding - borderThickness / 2);
    bNorth.userData.type = 'shaketable';
    baseGroup.add(bNorth);

    const bWest = new THREE.Mesh(borderGeoZ, this.matCautionBorder);
    bWest.position.set(-tablePadding + borderThickness / 2, tableY + tableThickness / 2 + borderHeight / 2, Lz / 2);
    bWest.userData.type = 'shaketable';
    baseGroup.add(bWest);

    const bEast = new THREE.Mesh(borderGeoZ, this.matCautionBorder);
    bEast.position.set(Lx + tablePadding - borderThickness / 2, tableY + tableThickness / 2 + borderHeight / 2, Lz / 2);
    bEast.userData.type = 'shaketable';
    baseGroup.add(bEast);

    // Rótulo 3D sobre la mesa vibratoria
    const tableLabel = this.createTextSprite("MESA VIBRATORIA SÍSMICA | LAB UTM", "#eab308");
    tableLabel.position.set(Lx / 2, tableY + tableThickness / 2 + 0.5, -tablePadding - 1.0);
    tableLabel.userData.type = 'shaketable';
    baseGroup.add(tableLabel);

    // Actuadores hidráulicos simulados a los costados
    this.buildActuatorPistons(baseGroup, Lx, Lz, tableY, tablePadding);

    // Zapatas y Pedestales
    const footingGeo = new THREE.BoxGeometry(fWidth, fHeight, fWidth);
    const pedestalHeight = 0.5;
    const pedestalGeo = new THREE.BoxGeometry(cWidth + 0.15, pedestalHeight, cDepth + 0.15);

    nodes.forEach(node => {
      const footing = new THREE.Mesh(footingGeo, this.matFooting);
      footing.position.set(node.x, -fHeight / 2 - pedestalHeight, node.z);
      footing.castShadow = true;
      footing.receiveShadow = true;
      footing.userData.type = 'footing';
      baseGroup.add(footing);

      const pedestal = new THREE.Mesh(pedestalGeo, this.matColumn);
      pedestal.position.set(node.x, -pedestalHeight / 2, node.z);
      pedestal.castShadow = true;
      pedestal.receiveShadow = true;
      pedestal.userData.type = 'footing';
      baseGroup.add(pedestal);
    });
  }

  buildActuatorPistons(baseGroup, Lx, Lz, tableY, padding) {
    const cylRadius = 0.35;
    const cylLen = 3.2;
    const cylGeo = new THREE.CylinderGeometry(cylRadius, cylRadius, cylLen, 16);
    cylGeo.rotateZ(Math.PI / 2);

    const actX = new THREE.Mesh(cylGeo, this.matActuator);
    actX.position.set(-padding - cylLen / 2, tableY, Lz / 2);
    actX.userData.type = 'shaketable';
    baseGroup.add(actX);

    const cylGeoZ = new THREE.CylinderGeometry(cylRadius, cylRadius, cylLen, 16);
    cylGeoZ.rotateX(Math.PI / 2);
    const actZ = new THREE.Mesh(cylGeoZ, this.matActuator);
    actZ.position.set(Lx / 2, tableY, -padding - cylLen / 2);
    actZ.userData.type = 'shaketable';
    baseGroup.add(actZ);
  }

  /**
   * Construye columnas para los 2 pisos y las registra para deformación dinámica
   */
  buildColumns(nodes, numStories, storyHeight, cWidth, cDepth) {
    const colGeo = new THREE.BoxGeometry(cWidth, storyHeight, cDepth);
    this.columnMeshes = [];

    for (let story = 0; story < numStories; story++) {
      const yCenter = (story + 0.5) * storyHeight;

      nodes.forEach(node => {
        const col = new THREE.Mesh(colGeo, this.matColumn);
        col.position.set(node.x, yCenter, node.z);
        col.castShadow = true;
        col.receiveShadow = true;
        col.userData.type = 'column';
        col.userData.story = story;

        this.columnsGroup.add(col);

        this.columnMeshes.push({
          mesh: col,
          story: story, // 0: Piso 1, 1: Piso 2
          origX: node.x,
          origY: yCenter,
          origZ: node.z
        });
      });
    }
  }

  /**
   * Construye vigas organizadas en sus respectivos storyGroups
   */
  buildBeams(nodeMap, maxI, maxJ, numStories, storyHeight, bWidth, bHeight) {
    for (let story = 1; story <= numStories; story++) {
      const group = this.storyGroups[story];
      const yBeam = story * storyHeight - (bHeight / 2);

      // Vigas longitudinales en X
      for (let j = 0; j <= maxJ; j++) {
        for (let i = 0; i < maxI; i++) {
          const n1 = nodeMap[`${i}_${j}`];
          const n2 = nodeMap[`${i + 1}_${j}`];
          if (n1 && n2) {
            const lengthX = Math.abs(n2.x - n1.x);
            const beamGeo = new THREE.BoxGeometry(lengthX, bHeight, bWidth);
            const beam = new THREE.Mesh(beamGeo, this.matBeam);
            beam.position.set((n1.x + n2.x) / 2, yBeam, n1.z);
            beam.castShadow = true;
            beam.receiveShadow = true;
            beam.userData.type = 'beam';
            group.add(beam);
          }
        }
      }

      // Vigas transversales en Z
      for (let i = 0; i <= maxI; i++) {
        for (let j = 0; j < maxJ; j++) {
          const n1 = nodeMap[`${i}_${j}`];
          const n2 = nodeMap[`${i}_${j + 1}`];
          if (n1 && n2) {
            const lengthZ = Math.abs(n2.z - n1.z);
            const beamGeo = new THREE.BoxGeometry(bWidth, bHeight, lengthZ);
            const beam = new THREE.Mesh(beamGeo, this.matBeam);
            beam.position.set(n1.x, yBeam, (n1.z + n2.z) / 2);
            beam.castShadow = true;
            beam.receiveShadow = true;
            beam.userData.type = 'beam';
            group.add(beam);
          }
        }
      }
    }
  }

  /**
   * Construye las losas de entrepiso y cubierta en forma de L
   */
  buildSlabs(Lx, Lz, a, b, numStories, storyHeight, thickness) {
    const shape = new THREE.Shape();
    // Polígono de la planta en L (croquis de Portoviejo):
    shape.moveTo(0, 0);
    shape.lineTo(Lx, 0);
    shape.lineTo(Lx, Lz - b);
    shape.lineTo(Lx - a, Lz - b); // Vértice entrante
    shape.lineTo(Lx - a, Lz);
    shape.lineTo(0, Lz);
    shape.closePath();

    const extrudeSettings = {
      steps: 1,
      depth: thickness,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.02,
      bevelSegments: 2
    };

    const slabGeo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    slabGeo.rotateX(Math.PI / 2);

    for (let story = 1; story <= numStories; story++) {
      const group = this.storyGroups[story];
      const ySlab = story * storyHeight;
      const slabMesh = new THREE.Mesh(slabGeo, this.matSlab);
      slabMesh.position.set(0, ySlab, 0);
      slabMesh.receiveShadow = true;
      slabMesh.userData.type = 'slab';
      group.add(slabMesh);
    }
  }

  /**
   * Construye diagonales de arriostramiento concéntrico en X (Caso 2: Mitigada)
   */
  buildMitigationBraces(nodeMap, maxI, maxJ, baysX1, baysZ1, numStories, storyHeight) {
    this.bracesData = [];

    // Ubicaciones de arriostramiento concéntrico en X en vanos perimetrales clave:
    // 1. Fachada frontal sur (Z = 0): vanos en extremos
    // 2. Fachada lateral oeste (X = 0): vanos en extremos
    // 3. Fachada norte del brazo superior (Z = maxJ): vano en x
    // 4. Fachada este del brazo inferior (X = maxI): vano en z
    // 5. Vano conector en esquina reentrante
    const candidateBays = [
      { n1: `0_0`, n2: `1_0`, dir: 'X' },
      { n1: `${maxI - 1}_0`, n2: `${maxI}_0`, dir: 'X' },
      { n1: `0_0`, n2: `0_1`, dir: 'Z' },
      { n1: `0_${maxJ - 1}`, n2: `0_${maxJ}`, dir: 'Z' },
      { n1: `0_${maxJ}`, n2: `1_${maxJ}`, dir: 'X' },
      { n1: `${maxI}_0`, n2: `${maxI}_1`, dir: 'Z' },
      { n1: `${baysX1}_${baysZ1}`, n2: `${baysX1 + 1}_${baysZ1}`, dir: 'X' },
      { n1: `${baysX1}_${baysZ1}`, n2: `${baysX1}_${baysZ1 + 1}`, dir: 'Z' }
    ];

    const tubeRadius = 0.09;

    candidateBays.forEach(bay => {
      const p1 = nodeMap[bay.n1];
      const p2 = nodeMap[bay.n2];

      if (p1 && p2) {
        this.bracesData.push({
          midX: (p1.x + p2.x) / 2,
          midZ: (p1.z + p2.z) / 2,
          direction: bay.dir
        });

        for (let story = 0; story < numStories; story++) {
          const group = this.storyGroups[story + 1];
          const yBottom = story * storyHeight;
          const yTop = (story + 1) * storyHeight;

          // Diagonal 1
          this.createCylinderMemberInGroup(
            group,
            new THREE.Vector3(p1.x, yBottom, p1.z),
            new THREE.Vector3(p2.x, yTop, p2.z),
            tubeRadius
          );

          // Diagonal 2
          this.createCylinderMemberInGroup(
            group,
            new THREE.Vector3(p2.x, yBottom, p2.z),
            new THREE.Vector3(p1.x, yTop, p1.z),
            tubeRadius
          );
        }
      }
    });
  }

  createCylinderMemberInGroup(group, vStart, vEnd, radius) {
    const direction = new THREE.Vector3().subVectors(vEnd, vStart);
    const length = direction.length();
    const geom = new THREE.CylinderGeometry(radius, radius, length, 12);

    const orientation = new THREE.Matrix4();
    orientation.lookAt(vStart, vEnd, new THREE.Vector3(0, 1, 0));

    const offset = new THREE.Vector3(0, 0, length / 2);
    offset.applyMatrix4(orientation);

    const mesh = new THREE.Mesh(geom, this.matBrace);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
    mesh.position.copy(vStart).add(direction.clone().multiplyScalar(0.5));
    mesh.castShadow = true;
    mesh.userData.type = 'brace';
    group.add(mesh);
  }

  /**
   * Cinemática dinámica: Aplica la deformación en la mesa vibratoria y entrepisos
   * Adaptada para 2 pisos según el inmueble comercial
   */
  applyDynamicMotion({ ug = 0, uStories = [0, 0], thetaStories = [0, 0], direction = 'XZ', visualScale = 2.0 }) {
    let dirX = 0, dirZ = 0;
    if (direction === 'X') {
      dirX = 1.0; dirZ = 0.0;
    } else if (direction === 'Z') {
      dirX = 0.0; dirZ = 1.0;
    } else {
      dirX = Math.SQRT1_2; dirZ = Math.SQRT1_2;
    }

    // 1. Desplazamiento de la base (Mesa Vibratoria y cimentación)
    const dx0 = ug * dirX * visualScale;
    const dz0 = ug * dirZ * visualScale;
    this.storyGroups[0].position.set(dx0, 0, dz0);

    const storyDisp = [{ x: dx0, z: dz0 }];

    // 2. Desplazamiento y rotación torsional de cada entrepiso (Nivel 1 y Nivel 2)
    const n = Math.min(this.params.numStories, uStories.length);
    for (let s = 1; s <= n; s++) {
      const uRel = (uStories[s - 1] || 0) * visualScale;
      const dx = dx0 + uRel * dirX;
      const dz = dz0 + uRel * dirZ;
      const theta = (thetaStories[s - 1] || 0) * visualScale;

      storyDisp.push({ x: dx, z: dz });

      const group = this.storyGroups[s];
      group.position.set(dx, 0, dz);
      group.rotation.y = theta;
    }

    // 3. Deformación a cortante y traslación de columnas
    const h = this.params.storyHeight;
    this.columnMeshes.forEach(col => {
      const s = col.story; // 0 o 1
      if (s < storyDisp.length - 1) {
        const bot = storyDisp[s];
        const top = storyDisp[s + 1];

        const midDx = (bot.x + top.x) / 2;
        const midDz = (bot.z + top.z) / 2;

        const tiltX = (top.x - bot.x) / h;
        const tiltZ = (top.z - bot.z) / h;

        col.mesh.position.set(col.origX + midDx, col.origY, col.origZ + midDz);
        col.mesh.rotation.z = -tiltX;
        col.mesh.rotation.x = tiltZ;
      }
    });
  }

  /**
   * Restablece la estructura a su posición estática de reposo (equilibrio)
   */
  resetDynamicMotion() {
    for (let s = 0; s < this.storyGroups.length; s++) {
      if (this.storyGroups[s]) {
        this.storyGroups[s].position.set(0, 0, 0);
        this.storyGroups[s].rotation.set(0, 0, 0);
      }
    }
    this.columnMeshes.forEach(col => {
      col.mesh.position.set(col.origX, col.origY, col.origZ);
      col.mesh.rotation.set(0, 0, 0);
    });
  }

  /**
   * Cálculos normativos NEC-15 (CM, CR, Excentricidad)
   */
  calculateStructuralPhysics() {
    const { Lx, Lz, a, b, isMitigated } = this.params;

    const irregularity = NECEngine.evaluatePlanIrregularity(Lx, Lz, a, b);
    const CM = NECEngine.calculateCenterOfMass(Lx, Lz, a, b);
    const CR = NECEngine.calculateCenterOfRigidity(this.columnsData, this.bracesData, isMitigated);
    const eccentricity = NECEngine.calculateEccentricity(CM, CR, Lx, Lz);

    const CR_original = NECEngine.calculateCenterOfRigidity(this.columnsData, [], false);
    const ecc_original = NECEngine.calculateEccentricity(CM, CR_original, Lx, Lz);

    this.analysisResults = {
      irregularity,
      CM,
      CR,
      eccentricity,
      CR_original,
      ecc_original,
      isMitigated
    };
  }

  /**
   * Construye esferas y líneas de visualización para CM, CR y Vértice Crítico
   */
  buildAnalysisMarkers(totalHeight) {
    if (!this.analysisResults) return;

    const { CM, CR, isMitigated } = this.analysisResults;
    const { Lx, Lz, a, b } = this.params;
    const yMarker = totalHeight + 0.8;

    // CM
    const cmGeo = new THREE.SphereGeometry(0.65, 24, 24);
    const cmMat = new THREE.MeshStandardMaterial({
      color: 0x22c55e,
      roughness: 0.2,
      metalness: 0.8,
      emissive: 0x14532d,
      emissiveIntensity: 0.6
    });
    const cmMesh = new THREE.Mesh(cmGeo, cmMat);
    cmMesh.position.set(CM.x, yMarker, CM.z);
    this.markersGroup.add(cmMesh);

    const cmSprite = this.createTextSprite("CM (Centro de Masas)", "#22c55e");
    cmSprite.position.set(CM.x, yMarker + 1.2, CM.z);
    this.markersGroup.add(cmSprite);

    // CR
    const crGeo = new THREE.SphereGeometry(0.65, 24, 24);
    const crColor = isMitigated ? 0x38bdf8 : 0xef4444;
    const crEmissive = isMitigated ? 0x0369a1 : 0x7f1d1d;
    const crMat = new THREE.MeshStandardMaterial({
      color: crColor,
      roughness: 0.2,
      metalness: 0.8,
      emissive: crEmissive,
      emissiveIntensity: 0.6
    });
    const crMesh = new THREE.Mesh(crGeo, crMat);
    crMesh.position.set(CR.x, yMarker, CR.z);
    this.markersGroup.add(crMesh);

    const crLabel = isMitigated ? "CR Mitigado (Rigidizado)" : "CR Original (Vulnerable)";
    const crSprite = this.createTextSprite(crLabel, isMitigated ? "#38bdf8" : "#ef4444");
    crSprite.position.set(CR.x, yMarker + 1.2, CR.z);
    this.markersGroup.add(crSprite);

    // Línea de excentricidad
    const points = [
      new THREE.Vector3(CM.x, yMarker, CM.z),
      new THREE.Vector3(CR.x, yMarker, CR.z)
    ];
    const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
    const eccLine = new THREE.Line(lineGeo, this.matEccentricity);
    eccLine.computeLineDistances();
    this.markersGroup.add(eccLine);

    const midX = (CM.x + CR.x) / 2;
    const midZ = (CM.z + CR.z) / 2;
    const distText = `e = ${this.analysisResults.eccentricity.torsionalArm} m`;
    const eccSprite = this.createTextSprite(distText, "#fbbf24");
    eccSprite.position.set(midX, yMarker + 0.6, midZ);
    this.markersGroup.add(eccSprite);

    // Vértice crítico
    if (this.params.showStressHotspot) {
      const vertexX = Lx - a;
      const vertexZ = Lz - b;

      const hotspotGeo = new THREE.CylinderGeometry(0.65, 0.65, totalHeight + 1.2, 16);
      const hotspotMesh = new THREE.Mesh(hotspotGeo, this.matHotspot);
      hotspotMesh.position.set(vertexX, (totalHeight + 1.2) / 2, vertexZ);
      this.markersGroup.add(hotspotMesh);

      const spotSprite = this.createTextSprite("⚠ Vértice Reentrante: Concentración de Esfuerzos", "#f87171");
      spotSprite.position.set(vertexX, totalHeight + 2.4, vertexZ);
      this.markersGroup.add(spotSprite);
    }
  }

  /**
   * Construye cotas acotadas y visuales en 3D
   */
  buildDimensions(Lx, Lz, a, b, numStories, storyHeight) {
    const totalH = numStories * storyHeight;

    this.addLinearDimension(
      new THREE.Vector3(0, 0, -3.2),
      new THREE.Vector3(Lx, 0, -3.2),
      `Lx = ${Lx.toFixed(2)} m (Croquis)`
    );

    this.addLinearDimension(
      new THREE.Vector3(-3.2, 0, 0),
      new THREE.Vector3(-3.2, 0, Lz),
      `Lz = ${Lz.toFixed(2)} m (Croquis)`
    );

    this.addLinearDimension(
      new THREE.Vector3(Lx - a, 0, Lz + 3.2),
      new THREE.Vector3(Lx, 0, Lz + 3.2),
      `a = ${a.toFixed(2)} m (${((a / Lx) * 100).toFixed(1)}%)`
    );

    this.addLinearDimension(
      new THREE.Vector3(Lx + 3.2, 0, Lz - b),
      new THREE.Vector3(Lx + 3.2, 0, Lz),
      `b = ${b.toFixed(2)} m (${((b / Lz) * 100).toFixed(1)}%)`
    );

    this.addLinearDimension(
      new THREE.Vector3(-3.2, 0, -3.2),
      new THREE.Vector3(-3.2, totalH, -3.2),
      `H = ${totalH.toFixed(2)} m (${numStories} pisos x ${storyHeight.toFixed(2)} m)`
    );
  }

  addLinearDimension(p1, p2, text) {
    const points = [p1, p2];
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(geo, this.matDimensionLine);
    this.dimensionsGroup.add(line);

    const dir = new THREE.Vector3().subVectors(p2, p1).normalize();
    const witnessLen = 0.8;
    const up = new THREE.Vector3(0, 1, 0);
    const normal = new THREE.Vector3().crossVectors(dir, up).normalize().multiplyScalar(witnessLen);

    const w1Geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3().subVectors(p1, normal),
      new THREE.Vector3().addVectors(p1, normal)
    ]);
    this.dimensionsGroup.add(new THREE.Line(w1Geo, this.matDimensionLine));

    const w2Geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3().subVectors(p2, normal),
      new THREE.Vector3().addVectors(p2, normal)
    ]);
    this.dimensionsGroup.add(new THREE.Line(w2Geo, this.matDimensionLine));

    const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
    const sprite = this.createTextSprite(text, "#38bdf8");
    sprite.position.copy(mid).add(new THREE.Vector3(0, 0.55, 0));
    this.dimensionsGroup.add(sprite);
  }

  buildStructuralAxes(xCoords, zCoords) {
    const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
    const numbers = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

    xCoords.forEach((x, idx) => {
      const label = letters[idx] || `X${idx + 1}`;
      const sprite = this.createAxisBubbleSprite(label);
      sprite.position.set(x, 0.1, -2.2);
      this.axesGroup.add(sprite);
    });

    zCoords.forEach((z, idx) => {
      const label = numbers[idx] || `Z${idx + 1}`;
      const sprite = this.createAxisBubbleSprite(label);
      sprite.position.set(-2.2, 0.1, z);
      this.axesGroup.add(sprite);
    });
  }

  createTextSprite(text, colorHex = '#ffffff') {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.roundRect(10, 15, 492, 98, 16);
    ctx.fill();

    ctx.lineWidth = 4;
    ctx.strokeStyle = colorHex;
    ctx.stroke();

    ctx.font = 'bold 36px "Segoe UI", Inter, sans-serif';
    ctx.fillStyle = colorHex;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 64);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const spriteMat = new THREE.SpriteMaterial({ map: texture, depthTest: false });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(4.2, 1.05, 1);
    return sprite;
  }

  createAxisBubbleSprite(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.arc(64, 64, 52, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineWidth = 6;
    ctx.strokeStyle = '#38bdf8';
    ctx.stroke();

    ctx.font = 'bold 52px "Segoe UI", Inter, sans-serif';
    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 64, 64);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: texture, depthTest: false });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(1.2, 1.2, 1);
    return sprite;
  }

  applyLayerVisibility() {
    this.storyGroups.forEach(group => {
      group.traverse(child => {
        if (child.userData.type === 'slab') child.visible = this.params.showSlabs;
        if (child.userData.type === 'beam') child.visible = this.params.showBeams;
        if (child.userData.type === 'footing') child.visible = this.params.showFoundations;
        if (child.userData.type === 'brace') child.visible = this.params.isMitigated;
        if (child.userData.type === 'shaketable') child.visible = this.params.showShakeTable;
      });
    });

    this.columnsGroup.visible = this.params.showColumns;
    this.dimensionsGroup.visible = this.params.showDimensions;
    this.axesGroup.visible = this.params.showAxes;
    this.markersGroup.visible = this.params.showMarkers;
  }
}

// Exportar para entorno navegador o Node
if (typeof module !== 'undefined' && module.exports) {
  module.exports = StructuralEngine;
}
