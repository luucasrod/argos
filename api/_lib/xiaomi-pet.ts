/**
 * Extensão Xiaomi Pet — Alimentadores, caixa de areia, bebedouro automático
 * Reutiliza a mesma autenticação/API da Xiaomi regular, mas com specs de dispositivos pet
 */

export interface XiaomiPetSpec {
  power?: { siid: number; piid: number };
  feedAmount?: { siid: number; piid: number; min: number; max: number };
  feedingSchedule?: { siid: number; piid: number };
  waterLevel?: { siid: number; piid: number; min: number; max: number };
  wasteLevel?: { siid: number; piid: number; min: number; max: number };
  cleaningMode?: { siid: number; piid: number; options: Array<{ value: number; label: string }> };
  lightControl?: { siid: number; piid: number };
  temperature?: { siid: number; piid: number };
}

export interface XiaomiPetDeviceDto {
  did: string;
  name: string;
  model: string;
  deviceType: 'feeder' | 'litter-box' | 'water-feeder' | 'other-pet';
  isOnline: boolean;
  isOn: boolean;
  feedAmountValue?: number;
  feedingScheduleValue?: string;
  waterLevelValue?: number;
  wasteLevelValue?: number;
  cleaningModeValue?: number;
  lightControlValue?: boolean;
  temperatureValue?: number;
  power?: { siid: number; piid: number };
  feedAmount?: { siid: number; piid: number; min: number; max: number };
  feedingSchedule?: { siid: number; piid: number };
  waterLevel?: { siid: number; piid: number; min: number; max: number };
  wasteLevel?: { siid: number; piid: number; min: number; max: number };
  cleaningMode?: { siid: number; piid: number; options: Array<{ value: number; label: string }> };
  lightControl?: { siid: number; piid: number };
  temperature?: { siid: number; piid: number };
}

// Modelos conhecidos de dispositivos Xiaomi Pet
const PET_DEVICE_MODELS: Record<string, { type: 'feeder' | 'litter-box' | 'water-feeder' | 'other-pet'; icon: string }> = {
  // Alimentadores automáticos para cães
  'xiaomi.petfeeder.feeder': { type: 'feeder', icon: '🐕' },
  'xiaomi.petfeeder.feederx': { type: 'feeder', icon: '🐕' },
  'xiaomi.petfeeder.feeder2': { type: 'feeder', icon: '🐕' },

  // Alimentadores para gatos
  'xiaomi.petfeeder.feedercats': { type: 'feeder', icon: '🐈' },

  // Caixa de areia automática
  'xiaomi.petcare.litter': { type: 'litter-box', icon: '🚽' },
  'xiaomi.petcare.litter-v2': { type: 'litter-box', icon: '🚽' },
  'xiaomi.petcare.litter-pro': { type: 'litter-box', icon: '🚽' },

  // Bebedouros automáticos
  'xiaomi.petfeeder.water-feeder': { type: 'water-feeder', icon: '💧' },
  'xiaomi.petfeeder.waterer': { type: 'water-feeder', icon: '💧' },
};

export async function xiaomiGetPetSpec(model: string): Promise<XiaomiPetSpec | null> {
  try {
    // TODO: Implementar descoberta de specs para dispositivos pet via miot-spec.org
    // Similar ao xiaomiGetFanSpec, mas procurando por services pet

    // Por enquanto, retorna um spec padrão baseado no modelo
    const deviceInfo = PET_DEVICE_MODELS[model];
    if (!deviceInfo) return null;

    // Specs genéricos básicos — cada modelo tem seu próprio na miot-spec
    const spec: XiaomiPetSpec = {
      power: { siid: 2, piid: 1 },
    };

    if (deviceInfo.type === 'feeder') {
      spec.feedAmount = { siid: 3, piid: 1, min: 10, max: 480 };
      spec.feedingSchedule = { siid: 3, piid: 2 };
    } else if (deviceInfo.type === 'litter-box') {
      spec.wasteLevel = { siid: 4, piid: 1, min: 0, max: 100 };
      spec.cleaningMode = { siid: 4, piid: 2, options: [
        { value: 0, label: 'Normal' },
        { value: 1, label: 'Strong' },
      ]};
      spec.lightControl = { siid: 2, piid: 2 };
    } else if (deviceInfo.type === 'water-feeder') {
      spec.waterLevel = { siid: 5, piid: 1, min: 0, max: 100 };
      spec.temperature = { siid: 5, piid: 2 };
    }

    return spec;
  } catch {
    return null;
  }
}

export function detectPetDeviceType(model: string): 'feeder' | 'litter-box' | 'water-feeder' | 'other-pet' {
  return PET_DEVICE_MODELS[model]?.type ?? 'other-pet';
}

export function getPetDeviceIcon(type: 'feeder' | 'litter-box' | 'water-feeder' | 'other-pet'): string {
  switch (type) {
    case 'feeder': return '🐕';
    case 'litter-box': return '🚽';
    case 'water-feeder': return '💧';
    default: return '🐾';
  }
}

export function getPetDeviceLabel(type: 'feeder' | 'litter-box' | 'water-feeder' | 'other-pet'): string {
  switch (type) {
    case 'feeder': return 'Alimentador';
    case 'litter-box': return 'Caixa de Areia';
    case 'water-feeder': return 'Bebedouro';
    default: return 'Acessório Pet';
  }
}
