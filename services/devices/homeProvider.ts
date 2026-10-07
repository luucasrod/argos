/**
 * FASE 9 — HomeProvider abstraction (Prompt Master Argos).
 *
 * Interface unificada para controlar dispositivos de qualquer marca.
 * Cada integração registra um HomeProvider aqui, em vez de if-chains
 * espalhados pelo código. Novos providers: implementar a interface e
 * chamar registerProvider().
 *
 * A dispatch final ainda usa updateDeviceState() do store para manter
 * o estado sincronizado — este arquivo é a camada de roteamento que
 * fica na frente disso.
 */
import type { Device } from '@/types/device.types';
import type { CapabilityTransport } from './capabilityModel';

export interface HomeProvider {
  /** Identificador único do provider (ex: 'tuya', 'ewelink', 'wiz'). */
  id: string;
  /** Nome legível para logs e UI. */
  label: string;
  /**
   * Controla um dispositivo deste provider.
   * Retorna promise que resolve quando o comando foi enviado (não confirmado).
   */
  transport: CapabilityTransport;
  /**
   * Detecta se este provider pode controlar o dispositivo.
   * Implementações devem verificar device.provider ou outras propriedades.
   */
  handles: (device: Device) => boolean;
}

const _registry = new Map<string, HomeProvider>();

export function registerProvider(provider: HomeProvider): void {
  _registry.set(provider.id, provider);
}

/** Retorna o provider registrado pelo id, ou null. */
export function getProvider(id: string): HomeProvider | null {
  return _registry.get(id) ?? null;
}

/**
 * Encontra o provider certo para o dispositivo.
 * Ordem: pelo device.provider → pelo primeiro que declarar handles() == true.
 */
export function resolveProvider(device: Device): HomeProvider | null {
  const byId = _registry.get((device as Device & { provider?: string }).provider ?? '');
  if (byId) return byId;

  for (const provider of _registry.values()) {
    if (provider.handles(device)) return provider;
  }
  return null;
}

/**
 * Executa um comando de propriedade num dispositivo, via o provider correto.
 * Lança erro se nenhum provider suportar o dispositivo.
 */
export async function executeHomeCommand(
  device: Device,
  property: string,
  value: unknown
): Promise<void> {
  const provider = resolveProvider(device);
  if (!provider) {
    throw new Error(`Nenhum provider registrado para o dispositivo "${device.name}" (id: ${device.id})`);
  }
  await provider.transport(device, property, value);
}

/** Lista todos os providers registrados (para debug/UI). */
export function listProviders(): HomeProvider[] {
  return Array.from(_registry.values());
}
