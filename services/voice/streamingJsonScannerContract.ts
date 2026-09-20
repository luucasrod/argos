import { extractSpeechFieldIfComplete } from './streamingJsonScanner';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Streaming JSON scanner contract: ${message}`);
}

export async function runStreamingJsonScannerContract(): Promise<string[]> {
  assert(
    extractSpeechFieldIfComplete('{"type":"chat","spee') === null,
    'buffer parcial sem chave completa deve devolver null'
  );

  assert(
    extractSpeechFieldIfComplete('{"type":"chat","speech":"Oi, tudo bem') === null,
    'valor de speech ainda aberto (sem aspas de fechamento) deve devolver null'
  );

  assert(
    extractSpeechFieldIfComplete('{"type":"chat","speech":"Oi, tudo bem?","text":"Oi, tudo b') ===
      'Oi, tudo bem?',
    'valor de speech fechado deve ser extraído mesmo com o resto do JSON incompleto'
  );

  assert(
    extractSpeechFieldIfComplete('{"type":"device_control","speech":"Ele disse \\"oi\\" pra mim","actions":[') ===
      'Ele disse "oi" pra mim',
    'aspas escapadas dentro do valor não devem ser tratadas como fechamento'
  );

  assert(
    extractSpeechFieldIfComplete('{"type":"chat","speech":"Linha 1\\nLinha 2","text":"..."}') ===
      'Linha 1\nLinha 2',
    'escapes JSON padrão (\\n) devem ser decodificados corretamente'
  );

  assert(
    extractSpeechFieldIfComplete('{"type":"chat","text":"sem campo speech"}') === null,
    'JSON sem o campo speech deve devolver null, nunca lançar'
  );

  assert(
    extractSpeechFieldIfComplete('') === null,
    'buffer vazio deve devolver null'
  );

  return [
    'partial-key-returns-null',
    'unclosed-value-returns-null',
    'closed-value-extracted-with-rest-incomplete',
    'escaped-quotes-not-treated-as-closing',
    'json-escapes-decoded',
    'missing-field-returns-null',
    'empty-buffer-returns-null',
  ];
}
