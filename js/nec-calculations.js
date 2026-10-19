/**
 * nec-calculations.js
 * Módulo de verificación normativa y cálculos analíticos sismorresistentes
 * Basado en NEC-15: Norma Ecuatoriana de la Construcción (NEC-SE-DS Peligro Sísmico)
 * Universidad Técnica de Manabí (UTM) - Facultad de Ciencias Matemáticas, Físicas y Químicas
 */

const NECEngine = {
  // Constantes de diseño sismorresistente preliminar para Manabí
  DEFAULT_ZONA_SISMICA: {
    zona: 'VI - Muy Alta Sismicidad (Costa Ecuatoriana / Manabí)',
    factorZ: 0.50, // Factor de aceleración en roca Z para Portoviejo/Manta
    tipoPerfilSuelo: 'Tipo D (Suelo rígido / cohesivo denso típico)',
    factorFa: 1.20,
    factorFd: 1.11,
    factorFs: 1.25,
    r_hormigon: 8.0, // Factor de reducción R para pórticos especiales sismorresistentes de HA
    r_arriostrado: 6.0 // Factor R para pórticos con arriostramientos excéntricos/concéntricos
  },

  /**
   * Evalúa la Irregularidad en Planta Tipo 2: Retroceso de las esquinas (NEC-SE-DS Tabla 7)
   * Criterio: Existe retroceso cuando ambas proyecciones de la planta más allá de la esquina
   * entrante son mayores al 15% de la dimensión total de la planta en la dirección considerada.
   */
  evaluatePlanIrregularity(Lx, Lz, a, b) {
    const ratioX = a / Lx;
    const ratioZ = b / Lz;
    const threshold = 0.15; // 15% límite normativo NEC-15

    const isIrregularX = ratioX > threshold;
    const isIrregularZ = ratioZ > threshold;
    const isIrregularType2 = isIrregularX && isIrregularZ;

    // Coeficiente de reducción de irregularidad en planta (phi_P)
    // NEC-SE-DS Tabla 7: phi_P2 = 0.90 cuando existe retroceso de esquinas
    const phi_p2 = isIrregularType2 ? 0.90 : 1.00;

    return {
      Lx,
      Lz,
      a,
      b,
      ratioX,
      ratioZ,
      ratioXPercent: (ratioX * 100).toFixed(1),
      ratioZPercent: (ratioZ * 100).toFixed(1),
      thresholdPercent: (threshold * 100).toFixed(1),
      isIrregularX,
      isIrregularZ,
      isIrregularType2,
      phi_p2,
      label: isIrregularType2 
        ? 'IRREGULARIDAD EN PLANTA TIPO 2 CONFIRMADA (Retroceso de Esquinas)'
        : 'PLANTA REGULAR O SEMI-REGULAR (Entrante inferior al 15%)',
      codeReference: 'NEC-SE-DS Capítulo 5, Tabla 7 (Irregularidades en Planta)'
    };
  },

  /**
   * Calcula el Centro de Masas (CM) teórico de una losa homogénea en forma de L
   * L-Shape definida con bounding box Lx x Lz, con recorte de tamaño a x b en la esquina (+X, +Z)
   */
  calculateCenterOfMass(Lx, Lz, a, b) {
    // Dividimos la L en dos bloques rectangulares:
    // Bloque 1: Base completa a lo largo de X, desde z=0 hasta z=(Lz - b)
    const A1 = Lx * (Lz - b);
    const x1 = Lx / 2;
    const z1 = (Lz - b) / 2;

    // Bloque 2: Ala saliente a lo largo de Z, desde z=(Lz - b) hasta z=Lz, ancho (Lx - a)
    const A2 = (Lx - a) * b;
    const x2 = (Lx - a) / 2;
    const z2 = (Lz - b) + (b / 2);

    const totalArea = A1 + A2;
    const xCM = (A1 * x1 + A2 * x2) / totalArea;
    const zCM = (A1 * z1 + A2 * z2) / totalArea;

    return {
      x: xCM,
      z: zCM,
      area: totalArea,
      cutoutArea: a * b,
      fullArea: Lx * Lz,
      areaEfficiency: (totalArea / (Lx * Lz)) * 100
    };
  },

  /**
   * Calcula el Centro de Rigidez (CR) de las columnas y marcos arriostrados
   * columns: Array de posiciones {x, z}
   * braces: Array de diagonales activas con su posición y rigidez lateral equivalente
   */
  calculateCenterOfRigidity(columns, braces = [], isMitigated = false) {
    if (!columns || columns.length === 0) return { x: 0, z: 0 };

    // Rigidez base de cada columna de hormigón armado (asumiendo sección uniforme inicial)
    const kCol = 1.0; 
    let sumKx_x = 0;
    let sumKx = 0;
    let sumKz_z = 0;
    let sumKz = 0;

    columns.forEach(col => {
      // Rigidez lateral en ambas direcciones ortogonales
      sumKx_x += kCol * col.x;
      sumKx += kCol;
      sumKz_z += kCol * col.z;
      sumKz += kCol;
    });

    // Si está mitigado, los arriostramientos de acero en X añaden gran rigidez en sus vanos
    if (isMitigated && braces && braces.length > 0) {
      // Un arriostramiento concéntrico en X típico aporta de 4 a 6 veces la rigidez de un pórtico simple
      const kBrace = 5.0; 
      braces.forEach(br => {
        if (br.direction === 'X') {
          sumKx_x += kBrace * br.midX;
          sumKx += kBrace;
        } else if (br.direction === 'Z') {
          sumKz_z += kBrace * br.midZ;
          sumKz += kBrace;
        }
      });
    }

    const xCR = sumKx_x / sumKx;
    const zCR = sumKz_z / sumKz;

    return {
      x: xCR,
      z: zCR,
      totalKx: sumKx,
      totalKz: sumKz
    };
  },

  /**
   * Calcula la excentricidad estática inherente (e_x, e_z) y torsión asociada
   */
  calculateEccentricity(CM, CR, Lx, Lz) {
    const ex = Math.abs(CM.x - CR.x);
    const ez = Math.abs(CM.z - CR.z);

    // Excentricidad accidental reglamentaria (5% de la dimensión en planta según NEC-SE-DS)
    const ex_acc = 0.05 * Lx;
    const ez_acc = 0.05 * Lz;

    // Excentricidad total de diseño preliminar aproximada
    const ex_total = ex + ex_acc;
    const ez_total = ez + ez_acc;

    return {
      ex,
      ez,
      exPercent: (ex / Lx * 100).toFixed(2),
      ezPercent: (ez / Lz * 100).toFixed(2),
      ex_acc,
      ez_acc,
      ex_total,
      ez_total,
      torsionalArm: Math.sqrt(ex * ex + ez * ez).toFixed(2),
      isSevereTorsion: (ex / Lx > 0.10) || (ez / Lz > 0.10)
    };
  }
};

// Exportar para entorno navegador o Node
if (typeof module !== 'undefined' && module.exports) {
  module.exports = NECEngine;
}
