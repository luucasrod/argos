/**
 * wizLocalDirect.web.ts — stub. UDP bruto não existe no browser; na web o
 * controle local da WiZ continua pela ponte (wizLocalBridgeService.ts).
 */
import type { WizDiscoveredDevice, WizPilotState } from './wizLocalDirect.native';

export async function discoverWizLocal(): Promise<WizDiscoveredDevice[]> {
  return [];
}

export async function getWizLocalPilot(): Promise<WizPilotState | null> {
  return null;
}

export async function setWizLocalPilot(): Promise<boolean> {
  return false;
}
