/**
 * scaling-module.js
 * Módulo de Escalamiento Físico y Selección de Materiales Comerciales para Mesa Vibratoria
 * Universidad Técnica de Manabí (UTM) - Facultad de Ciencias Matemáticas, Físicas y Químicas
 * Asignatura: Diseño Estructural
 */

const ScalingEngine = {
  // Mesas vibratorias típicas de laboratorio
  TABLE_OPTIONS: {
    'table_51': { name: 'Mesa Vibratoria 51 × 51 cm', sizeCm: 51.0, maxPayloadKg: 25.0 },
    'table_76': { name: 'Mesa Vibratoria 76 × 76 cm', sizeCm: 76.0, maxPayloadKg: 50.0 }
  },

  // Base de datos de materiales comerciales típicos para maquetas estructurales (Madera balsa, pino, MDF, acrílico)
  COMMERCIAL_STOCK: {
    columns: [
      { name: 'Listón Balsa 4 × 4 mm', dimMm: 4.0 },
      { name: 'Listón Balsa 6 × 6 mm', dimMm: 6.0 },
      { name: 'Listón Pino 8 × 8 mm', dimMm: 8.0 },
      { name: 'Listón Pino 10 × 10 mm', dimMm: 10.0 },
      { name: 'Listón Pino 12 × 12 mm', dimMm: 12.0 },
      { name: 'Perfil WPC 15 × 15 mm', dimMm: 15.0 }
    ],
    beams: [
      { name: 'Listón Balsa 3 × 6 mm', widthMm: 3.0, heightMm: 6.0 },
      { name: 'Listón Balsa 4 × 8 mm', widthMm: 4.0, heightMm: 8.0 },
      { name: 'Listón Pino 5 × 10 mm', widthMm: 5.0, heightMm: 10.0 },
      { name: 'Listón Pino 6 × 12 mm', widthMm: 6.0, heightMm: 12.0 },
      { name: 'Listón WPC 8 × 15 mm', widthMm: 8.0, heightMm: 15.0 }
    ],
    slabs: [
      { name: 'Plancha Balsa 2.0 mm', thickMm: 2.0 },
      { name: 'Plancha MDF / Acrílico 3.0 mm', thickMm: 3.0 },
      { name: 'Plancha MDF 4.0 mm', thickMm: 4.0 },
      { name: 'Plancha Contrachapado 5.0 mm', thickMm: 5.0 }
    ],
    braces: [
      { name: 'Varilla redonda fibra/acero Ø 2.0 mm', diamMm: 2.0 },
      { name: 'Varilla redonda madera Ø 3.0 mm', diamMm: 3.0 },
      { name: 'Perfil tubular aluminio Ø 4.0 mm', diamMm: 4.0 }
    ]
  },

  /**
   * Calcula el escalamiento geométrico completo
   */
  computeScaling({
    realLx = 31.0,           // Largo total X en metros
    realLz = 28.0,           // Largo total Z en metros
    realH = 6.0,             // Altura total en metros (2 pisos x 3m)
    wInf = 10.0,             // Ancho brazo inferior en metros
    wSup = 11.0,             // Ancho brazo superior en metros
    colDimM = 0.45,          // Sección de columna (m)
    beamHeightM = 0.45,      // Peralte de viga (m)
    beamWidthM = 0.30,       // Base de viga (m)
    slabThickM = 0.20,       // Espesor de losa (m)
    tableKey = 'table_51',   // 'table_51' o 'table_76'
    marginCm = 3.0           // Margen de seguridad editable para fijaciones (cm)
  }) {
    const table = this.TABLE_OPTIONS[tableKey] || this.TABLE_OPTIONS['table_51'];
    const tableSizeCm = table.sizeCm;

    // Espacio útil disponible en la mesa
    const usableSizeCm = Math.max(10.0, tableSizeCm - 2 * marginCm);

    // Dimensiones reales en centímetros
    const realLxCm = realLx * 100.0;
    const realLzCm = realLz * 100.0;

    // Factores de escala requeridos en cada dirección para no sobrepasar el área útil
    const kX = usableSizeCm / realLxCm;
    const kZ = usableSizeCm / realLzCm;

    // Escala uniforme que satisface ambas direcciones
    const k = Math.min(kX, kZ);
    const scaleN = 1.0 / k; // Relación 1:n

    // Dimensiones escaladas en cm
    const scaledLxCm = realLxCm * k;
    const scaledLzCm = realLzCm * k;
    const scaledHCm = (realH * 100.0) * k;
    const scaledStoryHCm = (realH / 2.0 * 100.0) * k;
    const scaledWInfCm = (wInf * 100.0) * k;
    const scaledWSupCm = (wSup * 100.0) * k;
    const scaledACm = ((realLx - wSup) * 100.0) * k;
    const scaledBCm = ((realLz - wInf) * 100.0) * k;

    // Secciones escaladas en milímetros
    const scaledColMm = (colDimM * 1000.0) * k;
    const scaledBeamHMm = (beamHeightM * 1000.0) * k;
    const scaledBeamWMm = (beamWidthM * 1000.0) * k;
    const scaledSlabMm = (slabThickM * 1000.0) * k;

    // Espacio libre remanente en la mesa (en cm)
    const freeMarginX = (tableSizeCm - scaledLxCm) / 2.0;
    const freeMarginZ = (tableSizeCm - scaledLzCm) / 2.0;

    // Verificaciones y Advertencias de Viabilidad de Fabricación
    const warnings = [];
    if (scaledLxCm > tableSizeCm || scaledLzCm > tableSizeCm) {
      warnings.push(`¡ALERTA CRÍTICA! La maqueta (${scaledLxCm.toFixed(1)} × ${scaledLzCm.toFixed(1)} cm) sobrepasa la mesa de ${tableSizeCm} cm.`);
    }

    if (freeMarginX < marginCm || freeMarginZ < marginCm) {
      warnings.push(`Espacio para mordazas/fijaciones insuficiente (${Math.min(freeMarginX, freeMarginZ).toFixed(1)} cm < ${marginCm} cm requeridos).`);
    }

    if (scaledColMm < 3.0) {
      warnings.push(`Sección de columna escalada muy delgada (${scaledColMm.toFixed(1)} mm). Riesgo de rotura al maqueta física.`);
    }

    if (scaledSlabMm < 1.5) {
      warnings.push(`Espesor de losa escalado (${scaledSlabMm.toFixed(1)} mm) requiere lámina muy fina; se sugiere espesor comercial de 2.0 a 3.0 mm.`);
    }

    // Comparación con Materiales Comerciales
    const commercialComparison = this.matchCommercialStock({
      idealColMm: scaledColMm,
      idealBeamHMm: scaledBeamHMm,
      idealBeamWMm: scaledBeamWMm,
      idealSlabMm: scaledSlabMm,
      scaledStoryHCm: scaledStoryHCm,
      scaledLxCm: scaledLxCm,
      scaledLzCm: scaledLzCm
    });

    return {
      table,
      tableSizeCm,
      marginCm,
      usableSizeCm,
      k,
      scaleN: scaleN.toFixed(1),
      scaleRatioText: `1 : ${scaleN.toFixed(1)}`,
      real: {
        Lx: realLx,
        Lz: realLz,
        H: realH,
        wInf: wInf,
        wSup: wSup,
        a: realLx - wSup,
        b: realLz - wInf,
        colDimM,
        beamHeightM,
        beamWidthM,
        slabThickM
      },
      scaled: {
        LxCm: scaledLxCm.toFixed(2),
        LzCm: scaledLzCm.toFixed(2),
        HCm: scaledHCm.toFixed(2),
        storyHCm: scaledStoryHCm.toFixed(2),
        wInfCm: scaledWInfCm.toFixed(2),
        wSupCm: scaledWSupCm.toFixed(2),
        aCm: scaledACm.toFixed(2),
        bCm: scaledBCm.toFixed(2),
        colMm: scaledColMm.toFixed(1),
        beamHMm: scaledBeamHMm.toFixed(1),
        beamWMm: scaledBeamWMm.toFixed(1),
        slabMm: scaledSlabMm.toFixed(1)
      },
      clearance: {
        freeMarginX: freeMarginX.toFixed(2),
        freeMarginZ: freeMarginZ.toFixed(2),
        minClearance: Math.min(freeMarginX, freeMarginZ).toFixed(2)
      },
      warnings,
      commercialComparison
    };
  },

  /**
   * Empareja las dimensiones ideales escaladas con los listones comerciales más cercanos
   */
  matchCommercialStock({ idealColMm, idealBeamHMm, idealBeamWMm, idealSlabMm, scaledStoryHCm }) {
    // 1. Columnas
    let bestCol = this.COMMERCIAL_STOCK.columns[0];
    let minColDiff = Infinity;
    this.COMMERCIAL_STOCK.columns.forEach(item => {
      const diff = Math.abs(item.dimMm - idealColMm);
      if (diff < minColDiff) {
        minColDiff = diff;
        bestCol = item;
      }
    });

    // 2. Vigas
    let bestBeam = this.COMMERCIAL_STOCK.beams[0];
    let minBeamDiff = Infinity;
    this.COMMERCIAL_STOCK.beams.forEach(item => {
      const diff = Math.abs(item.heightMm - idealBeamHMm) + Math.abs(item.widthMm - idealBeamWMm);
      if (diff < minBeamDiff) {
        minBeamDiff = diff;
        bestBeam = item;
      }
    });

    // 3. Losas
    let bestSlab = this.COMMERCIAL_STOCK.slabs[0];
    let minSlabDiff = Infinity;
    this.COMMERCIAL_STOCK.slabs.forEach(item => {
      const diff = Math.abs(item.thickMm - idealSlabMm);
      if (diff < minSlabDiff) {
        minSlabDiff = diff;
        bestSlab = item;
      }
    });

    const colPctDiff = ((bestCol.dimMm - idealColMm) / idealColMm) * 100.0;
    const beamHPctDiff = ((bestBeam.heightMm - idealBeamHMm) / idealBeamHMm) * 100.0;
    const slabPctDiff = ((bestSlab.thickMm - idealSlabMm) / idealSlabMm) * 100.0;

    return [
      {
        element: 'Columnas (cx = cz)',
        idealText: `${idealColMm.toFixed(1)} × ${idealColMm.toFixed(1)} mm`,
        commercialText: bestCol.name,
        commercialVal: `${bestCol.dimMm} × ${bestCol.dimMm} mm`,
        diffAbs: `${(bestCol.dimMm - idealColMm).toFixed(1)} mm`,
        diffPct: `${colPctDiff > 0 ? '+' : ''}${colPctDiff.toFixed(1)}%`,
        pieceLength: `${scaledStoryHCm.toFixed(1)} cm / pieza`,
        estimatedCount: '2 pisos × 28 cols = 56 uds'
      },
      {
        element: 'Vigas Principales (bv × hv)',
        idealText: `${idealBeamWMm.toFixed(1)} × ${idealBeamHMm.toFixed(1)} mm`,
        commercialText: bestBeam.name,
        commercialVal: `${bestBeam.widthMm} × ${bestBeam.heightMm} mm`,
        diffAbs: `H: ${(bestBeam.heightMm - idealBeamHMm).toFixed(1)} mm, B: ${(bestBeam.widthMm - idealBeamWMm).toFixed(1)} mm`,
        diffPct: `${beamHPctDiff > 0 ? '+' : ''}${beamHPctDiff.toFixed(1)}%`,
        pieceLength: 'Spans de 7 a 9 cm',
        estimatedCount: '2 niveles × ~48 tramos = 96 uds'
      },
      {
        element: 'Losas de Entrepiso y Techo',
        idealText: `e = ${idealSlabMm.toFixed(1)} mm`,
        commercialText: bestSlab.name,
        commercialVal: `e = ${bestSlab.thickMm} mm`,
        diffAbs: `${(bestSlab.thickMm - idealSlabMm).toFixed(1)} mm`,
        diffPct: `${slabPctDiff > 0 ? '+' : ''}${slabPctDiff.toFixed(1)}%`,
        pieceLength: 'Corte CNC en «L»',
        estimatedCount: '2 planchas continuas'
      }
    ];
  }
};

// Exportar para Node o navegador
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ScalingEngine;
}
