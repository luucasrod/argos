/**
 * Frases do caminho RÁPIDO (fastIntent), onde a IA nunca é chamada.
 *
 * Por que este arquivo existe: comandos simples ("liga a luz") são resolvidos
 * localmente por `matchFastDeviceCommand` para não pagar a ida ao LLM — é daí
 * que vem a resposta rápida. O efeito colateral é que a personalidade definida
 * em `systemPrompt.ts` (o tom Jarvis, o "senhor", as piadinhas) **nunca chega
 * nesses comandos**, porque ela só existe no prompt do modelo.
 *
 * Então as frases precisam carregar a personalidade por conta própria.
 *
 * Regras que valem aqui:
 * - **Curtas.** Cada caractere é tempo de fala e, quando a voz neural voltar,
 *   consumo de cota (10.000 caracteres/mês no plano grátis).
 * - **"senhor" no meio da frase**, não só no começo — é assim que soa natural.
 * - **Humor leve e nunca ofensivo**, e não em toda linha: piada em 100% das
 *   respostas cansa mais rápido do que nenhuma.
 * - Variar para não repetir a mesma frase o dia inteiro.
 */

/** Escolhe uma variante sem repetir a última usada para aquele grupo. */
const lastPick = new Map<string, number>();

function pick(key: string, options: string[]): string {
  if (options.length === 0) return '';
  if (options.length === 1) return options[0];
  const previous = lastPick.get(key);
  let index = Math.floor(Math.random() * options.length);
  if (index === previous) index = (index + 1) % options.length;
  lastPick.set(key, index);
  return options[index];
}

/** Confirmação de ligar/desligar um aparelho. */
export function speakToggle(deviceName: string, turningOn: boolean): string {
  return turningOn
    ? pick('on', [
        `Ligando ${deviceName}, senhor.`,
        `${deviceName} ligada. Feito, senhor.`,
        `Pronto, senhor. ${deviceName} no ar.`,
        `Ligando ${deviceName}. Nem precisou pedir duas vezes.`,
        `${deviceName} ligada, senhor.`,
      ])
    : pick('off', [
        `Desligando ${deviceName}, senhor.`,
        `${deviceName} desligada. Feito, senhor.`,
        `Pronto, senhor. ${deviceName} apagada.`,
        `Desligando ${deviceName}. Boa economia, senhor.`,
        `${deviceName} desligada, senhor.`,
      ]);
}

/** Confirmação quando o comando atinge vários aparelhos de uma vez. */
export function speakToggleMany(count: number, verb: string): string {
  return pick('many', [
    `${verb} ${count} dispositivos, senhor.`,
    `${verb} ${count} de uma vez. Feito, senhor.`,
    `Pronto, senhor. ${count} dispositivos.`,
  ]);
}

/** Confirmação de ajuste de brilho. */
export function speakBrightness(target: string, label: string): string {
  return pick('bright', [
    `Brilho de ${target} em ${label}, senhor.`,
    `Ajustando ${target} para ${label}. Feito, senhor.`,
    `Pronto, senhor. ${target} em ${label}.`,
    `${target} em ${label}, senhor. Do jeito que o senhor gosta.`,
  ]);
}
