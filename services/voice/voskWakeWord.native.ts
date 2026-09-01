/**
 * voskWakeWord.native.ts — wake word + comando ON-DEVICE via Vosk, numa fala só.
 *
 * Arquitetura, decidida por evidência do logcat:
 *   Um único reconhecedor, sempre com GRAMÁTICA, sobre um único AudioRecord que
 *   nunca é fechado. A gramática contém a wake word, as frases de comando do app,
 *   os nomes dos dispositivos e uma lista grande de palavras-isca. Como o comando
 *   também está na gramática, "Ei Argos, desliga a luz do escritório" é reconhecido
 *   numa fala só: a wake word é localizada no texto e o resto é o comando.
 *
 * Histórico das tentativas, para não repetir:
 *   1. Gramática com 3 entradas: detectava, mas qualquer ruído escorregava para a
 *      wake word — não havia alternativa para a fala comum cair. Falso positivo.
 *   2. Fechar o microfone e reabrir em outro modo depois de detectar: o Android
 *      NEGA abrir microfone novo com o app em segundo plano. Áudio morria.
 *   3. Texto livre (sem gramática): o log provou que o modelo pequeno NUNCA produz
 *      "argos" — a voz real saiu como "erros", "e aguas", "em angulos", "e os".
 *      Sem gramática a wake word é indetectável.
 *   Daí esta forma: gramática obrigatória, grande, e sem troca de microfone.
 *
 * Vosk é Apache 2.0 — uso comercial ilimitado, sem chave nem conta.
 */
import * as Vosk from 'react-native-vosk';
import type { EventSubscription } from 'react-native';
import { perfStart } from '@/services/voice/perfLog';

const MODEL_PATH = 'model-pt';
const DIACRITICS_RE = /[̀-ͯ]/g;

/**
 * Palavras-isca ("garbage model"). Existem para a fala comum ter onde cair.
 *
 * Isto veio de evidência, não de teoria: o log mostrou que em TEXTO LIVRE o modelo
 * pequeno nunca produz "argos" — a nossa própria voz saiu como "erros", "e aguas",
 * "em angulos", "e os". Ou seja, texto livre não detecta a wake word de jeito
 * nenhum, e a gramática restrita é obrigatória para forçar o reconhecimento.
 * O problema da gramática era ter poucas entradas: sem alternativas, qualquer
 * ruído escorregava para a wake word. Com uma lista grande de palavras frequentes,
 * a fala comum casa com elas e a wake word deixa de ser o único destino.
 */
const DECOYS = [
  'a', 'o', 'e', 'de', 'da', 'do', 'em', 'um', 'uma', 'para', 'com', 'não', 'sim',
  'que', 'por', 'mais', 'como', 'mas', 'já', 'isso', 'esse', 'essa', 'aqui', 'ali',
  'agora', 'depois', 'hoje', 'amanhã', 'ontem', 'muito', 'pouco', 'bom', 'boa',
  'bem', 'então', 'porque', 'quando', 'onde', 'quem', 'qual', 'tudo', 'nada',
  'gente', 'coisa', 'vez', 'tempo', 'dia', 'noite', 'casa', 'erros', 'águas',
  'ângulos', 'empregos', 'eventos', 'arcos', 'marcos', 'barcos', 'obrigado',
  'certo', 'errado', 'espera', 'olha', 'fala', 'sabe', 'acho', 'vamos', 'quero',
  'preciso', 'pode', 'vai', 'está', 'fica', 'faz', 'ver', 'sei', 'deixa',
];

/** Frases de comando que o app entende — ficam na gramática para serem ouvidas. */
const COMMAND_PHRASES = [
  'liga', 'desliga', 'acende', 'apaga', 'aumenta', 'diminui',
  'liga a luz', 'desliga a luz', 'acende a luz', 'apaga a luz',
  'liga a lâmpada', 'desliga a lâmpada',
  'aumenta o brilho', 'diminui o brilho',
  'liga a tomada', 'desliga a tomada',
  'liga o ventilador', 'desliga o ventilador',
  'liga tudo', 'desliga tudo',
  'a luz', 'a lâmpada', 'o brilho', 'a tomada', 'o ventilador',
  'do escritório', 'da sala', 'do quarto', 'da cozinha', 'do banheiro',
  'da varanda', 'da garagem', 'do corredor',
  // Cor. O backend já processa nome de cor -> hex (systemPrompt.ts), mas sem
  // estas palavras na gramática o Vosk nunca ouvia "cor" — forçava a fala
  // para a entrada mais próxima da lista, então o pedido nunca chegava certo.
  'muda a cor', 'troca a cor', 'muda a cor da luz', 'troca a cor da luz',
  'cor da luz', 'coloca a luz', 'deixa a luz',
  'vermelha', 'vermelho', 'verde', 'azul', 'amarela', 'amarelo',
  'laranja', 'roxa', 'roxo', 'rosa', 'ciano', 'branca', 'branco',
  'luz quente', 'luz fria', 'luz neutra',
  // Música. Nome de faixa é vocabulário ABERTO e não cabe numa gramática fechada,
  // então por voz só funcionam estes pedidos genéricos; para pedir uma música
  // específica é preciso digitar (ou trocar o reconhecimento para texto livre).
  'toca', 'coloca', 'põe', 'música', 'uma música', 'toca música',
  'coloca uma música', 'toca uma música', 'pausa', 'continua', 'próxima',
  /*
   * Perguntas abertas comuns (A-042/A-043). Antes desta lista, qualquer fala
   * fora do domínio de comando de casa (clima, piada, hora) era forçada para
   * a palavra mais próxima da gramática fechada — caso real de log: o
   * usuário perguntou sobre o clima e saiu "por que". A IA já processa texto
   * livre (services/ai/) uma vez que ouve certo; o problema era só OUVIR.
   * Toda palavra abaixo foi conferida contra o vocabulário do modelo pt
   * (assets/model-pt/Gr.fst) antes de entrar aqui — nenhuma gera
   * "Ignoring word missing in vocabulary".
   */
  // Clima
  'como está o tempo', 'vai chover', 'clima hoje', 'previsão do tempo',
  'qual é a previsão', 'vai fazer sol', 'está frio', 'está calor', 'temperatura hoje',
  // Piada
  'conta uma piada', 'me conta uma piada', 'conta piada', 'me faz rir', 'sabe alguma piada',
  // Hora e data
  'que horas são', 'que dia é hoje', 'qual a data de hoje', 'qual o dia de hoje',
  // Lembrete. Sem estas frases na gramática, "cria um lembrete" nunca era
  // ouvido certo — mesma regra geral de vocabulário do bloco de cor acima.
  'cria um lembrete', 'me lembra de', 'define um lembrete', 'adiciona um lembrete',
  // Pergunta geral
  'o que você acha', 'me explica', 'como funciona', 'o que é isso',
  'pode me ajudar', 'me ajuda',
  // Saudação e despedida
  'bom dia', 'boa tarde', 'boa noite', 'tchau', 'até logo',
  'obrigado', 'obrigada', 'valeu',
  // Iniciadores livres de pergunta, soltos — dão à fala comum mais lugares
  // para cair, iguais em espírito às iscas de DECOYS.
  'por que', 'quando', 'onde', 'quem', 'de que forma',
];

/** Silêncio, após o comando, que encerra a fala e manda pensar. */
// 800 ms, nao 1200: o usuario mediu ~4 s entre comecar a falar e o Argos
// responder, e identificou que a espera esta justamente aqui — o tempo que
// ele leva pra decidir que a frase acabou. Cada ms daqui sai direto da
// latencia percebida. 800 ms ainda cobre pausa entre palavras; se comecar a
// cortar gente no meio da frase, subir de volta.
const COMMAND_SILENCE_MS = 800;
/** Espera por um comando quando só a wake word foi dita. */
const AWAIT_COMMAND_MS = 4000;

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(DIACRITICS_RE, '').trim();
}

/**
 * Forma que vai para a GRAMÁTICA do Vosk — minúscula, sem espaço sobrando, mas
 * COM acento. O vocabulário do modelo pt tem 99.101 palavras e todas as
 * acentuadas estão lá na forma acentuada; "escritorio"/"lampada" simplesmente
 * não existem. Usar normalize() aqui era o motivo de o Argos nunca entender
 * "escritório".
 */
function toGrammar(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Variantes do primeiro token. O Vosk erra muito nessa sílaba curta — nas provas
 * reais saiu "e", "a", "é" e até nada. Ser generoso aqui é seguro porque o
 * segundo token ("argos") é que carrega a distinção.
 */
const FIRST_ALT = '(?:ei|e|eh|he|hei|ai|a|o)';
/*
 * Variantes do nome. Mantidas só as foneticamente bem próximas de "argos"
 * (argus/argo). "arcos", "airbus", "argox", "hargos" saíram da lista —
 * são palavras/sons comuns na fala normal e viraram a maior fonte de falso
 * positivo (o Argos respondendo sozinho, sem ninguém chamar). O usuário
 * preferiu explicitamente mais rigor aqui, mesmo perdendo chamadas reais
 * ocasionais: "mesmo se ele não me ouvir não tem problema".
 */
const NAME_ALT = '(?:argos|argus|argo)';

/**
 * Frases aceitas para acordar, além da configurada nas preferências.
 *
 * Por que várias e por que longas: o log provou que "argos" sozinho colide com
 * arcos/erros/marcos/águas — é curto demais e tem vizinhos foneticamente próximos.
 * Frase longa é MAIS fácil de reconhecer, não menos: dá ao decodificador um alvo
 * acústico maior e mais distinto. "argos escuta" (5 sílabas) é bem mais robusto
 * que "ei argos" (3). Aceitar várias deixa a pessoa usar a que sair natural, sem
 * precisar falar pausado.
 *
 * Só entram palavras confirmadas no vocabulário do modelo (conferidas nos FSTs):
 * escuta=62, acorda=70, ola=presente. "atencao" deu 0 e ficou de fora.
 */
const WAKE_SUFFIX_WORDS = ['escuta', 'acorda'];
// 'e' e 'a' foram REMOVIDOS (30/08): são vogais soltas, as palavras mais
// comuns da fala normal. Como a gramática do Vosk é fechada, qualquer
// ruído perto de "...e argo..." era forçado para a entrada "e argos" e
// acordava o Argos sozinho — a maior fonte de falso positivo relatada.
// Mantidos só prefixos com consoante/sílaba distintiva.
const WAKE_PREFIX_WORDS = ['ei', 'ola', 'ok', 'oi'];

/**
 * Monta os padrões de detecção. Todos consomem a frase INTEIRA, para que o que
 * sobra depois seja exatamente o comando.
 *
 *   A) <prefixo> + nome            "ei argos / olá argos / ok argos, desliga..."
 *   B) nome + <sufixo>             "argos escuta / argos acorda, desliga..."
 *
 * Existia um terceiro padrão (nome sozinho no início da frase, tipo "argos,
 * desliga...") — removido a pedido explícito do usuário: era o gatilho mais
 * fácil de disparar à toa (bastava a frase começar com algo parecido com
 * "argos"), e ele preferiu perder algumas chamadas reais a continuar com o
 * Argos respondendo sozinho o dia inteiro sem ninguém chamar. Agora SEMPRE
 * precisa de prefixo ("ei argos") ou sufixo ("argos escuta").
 */
function buildWakePatterns(wakeWord: string): RegExp[] {
  const full = normalize(wakeWord);
  const parts = full.split(/\s+/).filter(Boolean);
  const name = parts.length > 1 ? parts[parts.length - 1] : full;
  const nameAlt = name === 'argos' ? NAME_ALT : '(?:' + name + ')';

  const prefixAlt = '(?:' + [...new Set([...WAKE_PREFIX_WORDS, parts[0] || 'ei'])].join('|') + ')';
  const suffixAlt = '(?:' + WAKE_SUFFIX_WORDS.join('|') + ')';

  return [
    // B primeiro: é a mais específica, e consome também o sufixo.
    new RegExp('(?:^|[^a-z])' + nameAlt + '\\s+' + suffixAlt + '(?![a-z])', 'i'),
    new RegExp('(?:^|[^a-z])' + prefixAlt + '\\s+' + nameAlt + '(?![a-z])', 'i'),
  ];
}

/** Devolve o índice onde a wake word termina, ou -1. */
function findWakeEnd(heard: string, patterns: RegExp[]): number {
  for (const re of patterns) {
    const m = re.exec(heard);
    if (m) return m.index + m[0].length;
  }
  return -1;
}

function textOf(raw: string): string {
  try {
    const p = JSON.parse(raw) as { text?: string; partial?: string };
    return p.text ?? p.partial ?? '';
  } catch {
    return raw ?? '';
  }
}

/** Monta a gramática: wake word + comandos + nomes dos dispositivos + iscas. */
function buildGrammar(wakeWord: string, extra: string[]): string[] {
  const full = normalize(wakeWord);
  const parts = full.split(/\s+/).filter(Boolean);
  const name = parts.length > 1 ? parts[parts.length - 1] : full;

  const set = new Set<string>([full]);

  /*
   * Caminhos alternativos para quando o "ei" sai colado ou engolido, que é como
   * se fala na prática. Dar essas opções à gramática deixa o reconhecedor escolher
   * uma delas em vez de escorregar para uma isca.
   *
   * Só entram palavras que existem no vocabulário do modelo — inventar "eargos"
   * seria descartado (o log já mostrou "Ignoring word missing in vocabulary").
   * O casamento dessas formas já é coberto por buildWakePatterns: o nome sozinho
   * só vale no INÍCIO da fala, o que é o que evita falso positivo.
   */
  if (parts.length > 1) {
    set.add(name);
    // Prefixos: cobre "ei/olá/ok/oi argos" e o "ei" engolido virando "e"/"a".
    WAKE_PREFIX_WORDS.forEach((p) => set.add(p + ' ' + name));
    // Sufixos: as formas LONGAS, que são as mais fáceis de reconhecer.
    WAKE_SUFFIX_WORDS.forEach((s) => set.add(name + ' ' + s));
  }
  // A wake word sozinha e também colada nos comandos, para a fala de enfiada
  // "ei argos desliga a luz" ser reconhecida como sequência.
  COMMAND_PHRASES.forEach((p) => set.add(p));
  extra.forEach((p) => {
    // toGrammar, NÃO normalize: o vocabulário do modelo pt guarda as palavras
    // ACENTUADAS ("escritório", "lâmpada"). Mandar a forma sem acento faz o Vosk
    // descartar a entrada inteira ("Ignoring word missing in vocabulary") e o
    // aparelho fica impossível de chamar pelo nome. Só o texto OUVIDO é
    // normalizado (findWakeEnd/heard), e isso continua igual.
    const n = toGrammar(p);
    if (n.length >= 3) set.add(n);
  });
  DECOYS.forEach((d) => set.add(d));
  set.add('[unk]');
  return [...set];
}

let modelLoaded = false;
let listening = false;
let suspended = false;
let grammar: string[] = [];
let patterns: RegExp[] = [];
let subs: EventSubscription[] = [];

let onWake: (() => void) | null = null;
let onCommandText: ((text: string) => void) | null = null;
let onCommandPartial: ((text: string) => void) | null = null;

/** Estado da fala em curso. */
let armed = false;
let committed = '';
let partial = '';
let silenceTimer: ReturnType<typeof setTimeout> | null = null;
let lastCommand = '';

function currentCommand(): string {
  return (committed + ' ' + partial).replace(/\s+/g, ' ').trim();
}

function clearSilence(): void {
  if (silenceTimer) {
    clearTimeout(silenceTimer);
    silenceTimer = null;
  }
}

function resetUtterance(): void {
  clearSilence();
  armed = false;
  committed = '';
  partial = '';
  lastCommand = '';
}

function submit(): void {
  const text = currentCommand();
  vlog('ENVIANDO comando: "' + text + '"');
  perfStart('fim_da_fala (silencio detectado)');
  resetUtterance();
  onCommandText?.(text);
}

function armSilence(ms: number): void {
  clearSilence();
  silenceTimer = setTimeout(() => {
    silenceTimer = null;
    if (armed) submit();
  }, ms);
}

/**
 * Diagnóstico de voz no logcat (tag ReactNativeJS, prefixo [argos-vosk]).
 *
 * Fica LIGADO de propósito: sem ver a transcrição real, qualquer ajuste no
 * reconhecimento é chute. Foi assim que se perdeu tempo desenhando padrões
 * contra transcrições imaginadas em vez das que o modelo realmente devolve.
 */
function vlog(msg: string): void {
  console.log('[argos-vosk] ' + msg);
}

/** Processa uma transcrição (parcial ou final) do reconhecedor. */
function handle(raw: string, isFinal: boolean): void {
  if (!listening || suspended) return;

  const heard = normalize(textOf(raw));
  if (heard) {
    vlog(
      (isFinal ? 'FINAL' : 'parcial') +
        ' "' + heard + '"' +
        ' wake=' + (findWakeEnd(heard, patterns) >= 0) +
        ' armado=' + armed
    );
  }

  if (!armed) {
    if (!heard) return;
    const end = findWakeEnd(heard, patterns);
    if (end < 0) return;

    armed = true;
    committed = '';
    partial = heard.slice(end).trim();
    // Bipe imediato: a pessoa precisa saber que foi ouvida antes de continuar.
    onWake?.();
    if (isFinal) {
      committed = partial;
      partial = '';
    }
    lastCommand = currentCommand();
    onCommandPartial?.(lastCommand);
    // Se já veio comando junto, corta no silêncio; se não, espera um pouco mais.
    armSilence(lastCommand ? COMMAND_SILENCE_MS : AWAIT_COMMAND_MS);
    return;
  }

  // Já acordado: tudo que vier é comando. A wake word pode reaparecer numa nova
  // transcrição depois de um restart do Vosk — nesse caso corta ela de novo.
  const end = findWakeEnd(heard, patterns);
  const piece = (end >= 0 ? heard.slice(end) : heard).trim();

  if (isFinal) {
    if (piece) committed = (committed + ' ' + piece).trim();
    partial = '';
  } else {
    partial = piece;
  }

  const now = currentCommand();
  if (now !== lastCommand) {
    lastCommand = now;
    onCommandPartial?.(now);
    // Só reinicia o relógio quando a transcrição REALMENTE avançou: o Vosk repete
    // a mesma parcial durante o silêncio, e reiniciar a cada evento impediria o corte.
    armSilence(now ? COMMAND_SILENCE_MS : AWAIT_COMMAND_MS);
  }
}

function clearSubs(): void {
  subs.forEach((s) => {
    try {
      s.remove();
    } catch {}
  });
  subs = [];
}

async function ensureModel(): Promise<boolean> {
  if (modelLoaded) return true;
  try {
    await Vosk.loadModel(MODEL_PATH);
    modelLoaded = true;
    return true;
  } catch {
    return false;
  }
}

/**
 * (Re)inicia o reconhecedor em texto livre, com retentativa: a liberação do
 * AudioRecord pelo nativo não é instantânea, então a primeira tentativa logo
 * após um stop pode falhar com o microfone ainda ocupado.
 */
async function restart(attempt = 0): Promise<void> {
  if (!listening || suspended) return;
  try {
    // SEMPRE com gramática: em texto livre o modelo pequeno nunca produz "argos"
    // (comprovado no log). A gramática é o que força o reconhecimento.
    await Vosk.start({ grammar });
    vlog('start OK (' + grammar.length + ' entradas)' + (attempt ? ' tentativa ' + (attempt + 1) : ''));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    vlog('start FALHOU tentativa ' + (attempt + 1) + ': ' + msg);
    if (attempt < 5) {
      await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
      return restart(attempt + 1);
    }
    vlog('start desistiu apos 6 tentativas - microfone morto');
  }
}

export async function startVoskWakeWord(opts: {
  wakeWord: string;
  onWakeWordDetected: () => void;
  onCommand: (text: string) => void;
  onPartial?: (text: string) => void;
  /** Nomes de dispositivos e cômodos, para entrarem na gramática. */
  extraPhrases?: string[];
}): Promise<boolean> {
  if (listening) return true;
  if (!(await ensureModel())) return false;

  patterns = buildWakePatterns(opts.wakeWord || 'Ei Argos');
  grammar = buildGrammar(opts.wakeWord || 'Ei Argos', opts.extraPhrases ?? []);
  vlog('gramatica com ' + grammar.length + ' entradas');
  onWake = opts.onWakeWordDetected;
  onCommandText = opts.onCommand;
  onCommandPartial = opts.onPartial ?? null;
  listening = true;
  suspended = false;
  resetUtterance();

  clearSubs();
  subs.push(Vosk.onPartialResult((e) => handle(e, false)));
  subs.push(Vosk.onResult((e) => handle(e, true)));
  subs.push(
    Vosk.onFinalResult((e) => {
      handle(e, true);
      void restart();
    })
  );
  subs.push(
    Vosk.onTimeout(() => {
      if (armed) submit();
      void restart();
    })
  );
  subs.push(
    Vosk.onError((e) => {
      vlog('onError: ' + String(e));
      resetUtterance();
      void restart();
    })
  );

  try {
    await Vosk.start({ grammar });
    return true;
  } catch {
    listening = false;
    clearSubs();
    return false;
  }
}

/**
 * Arma a escuta manualmente, sem a wake word — é o toque no orb.
 * O microfone já está aberto, então isso é só mudança de estado: nada de
 * fechar/reabrir áudio, que é o que não sobrevive em segundo plano.
 */
export function armVoskUtterance(): boolean {
  if (!listening || suspended) return false;
  resetUtterance();
  armed = true;
  armSilence(AWAIT_COMMAND_MS);
  return true;
}

/** Descarta a fala em curso e volta a apenas vigiar a wake word. */
export function cancelVoskUtterance(): void {
  resetUtterance();
}

export function isVoskArmed(): boolean {
  return armed;
}

export function suspendVoskWakeWord(): void {
  if (!listening || suspended) return;
  suspended = true;
  resetUtterance();
  try {
    Vosk.stop();
  } catch {}
}

export function resumeVoskWakeWord(): void {
  if (!listening || !suspended) return;
  suspended = false;
  void restart();
}

export async function stopVoskWakeWord(): Promise<void> {
  listening = false;
  suspended = false;
  onWake = null;
  onCommandText = null;
  onCommandPartial = null;
  resetUtterance();
  clearSubs();
  try {
    Vosk.stop();
  } catch {}
}

export function isVoskWakeWordRunning(): boolean {
  return listening;
}

export function isVoskWakeWordSuspended(): boolean {
  return suspended;
}
