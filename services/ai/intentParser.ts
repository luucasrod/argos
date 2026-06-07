export interface ParsedIntent {
  type:
    | 'device_control'
    | 'automation'
    | 'chat'
    | 'routine'
    | 'query'
    | 'open_url'
    | 'get_weather'
    | 'set_reminder'
    | 'save_note';
  speech: string;
  text: string;
  // device_control
  actions?: Array<{
    deviceId: string;
    action: string;
    property: string;
    value: unknown;
    label: string;
  }>;
  // automation
  automation?: Record<string, unknown>;
  // routine
  routineId?: string;
  // open_url
  url?: string;
  // get_weather
  cityName?: string;
  // set_reminder
  title?: string;
  message?: string;
  delayMinutes?: number;
  // save_note
  noteContent?: string;
  // extração de memória (presente em qualquer tipo de resposta)
  newMemory?: {
    title: string;
    content: string;
    category: 'routine' | 'preference' | 'person' | 'location' | 'habit' | 'context';
    tags: string[];
  };
  // erro
  error?: string;
}

export function parseAIResponse(rawResponse: string): ParsedIntent {
  try {
    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        type: 'chat',
        speech: rawResponse,
        text: rawResponse,
      };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return parsed as ParsedIntent;
  } catch {
    return {
      type: 'chat',
      speech: rawResponse,
      text: rawResponse,
      error: 'parse_error',
    };
  }
}
