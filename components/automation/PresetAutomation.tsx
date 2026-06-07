import React from 'react';
import { AutomationCard } from './AutomationCard';
import { Automation } from '@/types/automation.types';

interface PresetAutomationProps {
  automation: Automation;
  onToggle: () => void;
  onRun?: () => void;
}

export function PresetAutomation({ automation, onToggle, onRun }: PresetAutomationProps) {
  return <AutomationCard automation={automation} onToggle={onToggle} onPress={onRun} />;
}
