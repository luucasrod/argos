/**
 * streamingJsonScanner.ts — issue #237 (Fase 4, épico #232, voz
 * conversacional em tempo real).
 *
 * O LLM sempre responde em JSON com `"type"` primeiro e `"speech"` segundo
 * (ver `services/ai/systemPrompt.ts`, todo exemplo de schema segue essa
 * ordem) — `speech` é a frase curta que vai virar áudio; o resto do objeto
 * (`actions`, `text`, etc.) tende a ser mais longo. Streaming o texto do LLM
 * chunk a chunk, este scanner detecta o momento em que o VALOR do campo
 * `"speech"` fecha (aspas não-escapadas) sem esperar o JSON inteiro —
 * permite começar a sintetizar/tocar áudio antes da resposta completa
 * terminar de chegar.
 *
 * Deliberadamente não é um parser JSON de verdade (não valida a estrutura
 * inteira) — só extrai UMA string de UM campo conhecido, de um formato que o
 * próprio prompt controla. Suficiente pro caso de uso, mais simples e mais
 * fácil de auditar que trazer uma lib de parsing incremental de JSON.
 */

/**
 * Scanner incremental que emite tokens do campo `speech` conforme o buffer
 * cresce. Ao contrário de `extractSpeechFieldIfComplete`, não espera o campo
 * fechar — emite cada trecho novo disponível, permitindo streaming real-time
 * de TTS enquanto o LLM ainda está gerando a resposta.
 */
export class SpeechTokenScanner {
  private state: 'searching' | 'in_value' | 'done' = 'searching';
  private lastPos = 0;

  /**
   * Processa o buffer acumulado e devolve qualquer texto novo do campo
   * `speech` desde a última chamada. `null` se nada novo disponível.
   */
  feed(buf: string): string | null {
    if (this.state === 'done') return null;

    if (this.state === 'searching') {
      const keyIndex = buf.indexOf('"speech"');
      if (keyIndex === -1) return null;

      const afterKey = keyIndex + '"speech"'.length;
      const colonIndex = buf.indexOf(':', afterKey);
      if (colonIndex === -1) return null;

      let i = colonIndex + 1;
      while (i < buf.length && (buf[i] === ' ' || buf[i] === '\n' || buf[i] === '\t' || buf[i] === '\r')) i++;
      if (i >= buf.length || buf[i] !== '"') return null;

      this.lastPos = i + 1;
      this.state = 'in_value';
    }

    if (this.state === 'in_value') {
      let j = this.lastPos;
      let extracted = '';
      while (j < buf.length) {
        const ch = buf[j];
        if (ch === '\\') {
          if (j + 1 >= buf.length) break; // escape incompleto — aguarda mais dados
          const next = buf[j + 1];
          switch (next) {
            case '"': extracted += '"'; break;
            case '\\': extracted += '\\'; break;
            case 'n': extracted += '\n'; break;
            case 'r': extracted += '\r'; break;
            case 't': extracted += '\t'; break;
            default: extracted += next; break;
          }
          j += 2;
        } else if (ch === '"') {
          this.state = 'done';
          this.lastPos = j + 1;
          return extracted || null;
        } else {
          extracted += ch;
          j++;
        }
      }
      this.lastPos = j;
      return extracted || null;
    }

    return null;
  }

  get isDone(): boolean {
    return this.state === 'done';
  }
}

/**
 * Devolve o texto do campo `"speech"` assim que o valor fechar (aspas
 * não-escapada encontrada), ou `null` se ainda não chegou até lá no buffer
 * acumulado. Não lança em buffer malformado — devolve `null` e deixa o
 * parse completo (`parseAIResponse`, ao final do stream) ser a fonte da
 * verdade.
 */
export function extractSpeechFieldIfComplete(buf: string): string | null {
  const keyIndex = buf.indexOf('"speech"');
  if (keyIndex === -1) return null;

  const afterKey = keyIndex + '"speech"'.length;
  const colonIndex = buf.indexOf(':', afterKey);
  if (colonIndex === -1) return null;

  // Só espaço em branco entre ':' e a abertura de aspas — qualquer outra
  // coisa (ex.: dois-pontos dentro de outra string que por acaso contém o
  // texto '"speech"' antes do campo real) não é o campo que procuramos.
  let i = colonIndex + 1;
  while (i < buf.length && /\s/.test(buf[i])) i++;
  if (i >= buf.length) return null;
  if (buf[i] !== '"') return null; // formato inesperado — desiste, parse completo resolve depois
  const valueStart = i + 1;

  let j = valueStart;
  while (j < buf.length) {
    const ch = buf[j];
    if (ch === '\\') {
      j += 2; // pula o caractere escapado, seja qual for
      continue;
    }
    if (ch === '"') {
      const raw = buf.slice(valueStart, j);
      try {
        // Reaproveita o parser de string do próprio JSON.parse em vez de
        // reimplementar unescape (\n, \", \uXXXX, etc.) à mão.
        return JSON.parse(`"${raw}"`);
      } catch {
        return null; // string malformada até aqui — parse completo resolve
      }
    }
    j++;
  }
  return null; // ainda não fechou — precisa de mais dados do stream
}
