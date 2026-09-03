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
import { recordSuspiciousAttempt } from '@/services/voice/suspiciousVoiceAttempts';

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
// #204: 800ms comecou a cortar gente no meio da frase, exatamente o aviso
// que este comentario ja dava. Subiu pra 1000 — meio-termo entre a latencia
// percebida que motivou baixar de 1200 pra 800, e cobrir pausa natural entre
// frase e complemento. Nao subiu ate 1200 de volta: a janela mais longa
// (CONNECTOR_SILENCE_MS abaixo) cobre o caso especifico que mais dói (pausa
// logo apos um conector, esperando complemento), entao o teto geral pode
// ficar mais baixo sem reabrir o problema de latencia original.
const COMMAND_SILENCE_MS = 1000;
/** Espera por um comando quando só a wake word foi dita. */
const AWAIT_COMMAND_MS = 4000;

/*
 * #204: usuario relatou corte no meio de frases com pausa natural antes de
 * um complemento (ex.: "luz do escritorio" [pausa] "em azul" — o "em azul"
 * nunca chegava, o comando saia incompleto). Uma pausa assim e mais longa
 * que uma pausa comum entre palavras, mas subir COMMAND_SILENCE_MS pra todo
 * mundo reintroduziria a latencia percebida que motivou baixar pra 800/1000.
 *
 * Heuristica: quando a ULTIMA palavra reconhecida termina em conector/
 * preposicao, a frase esta gramaticalmente pendente — a pessoa quase sempre
 * vai completar (com cor, comodo, etc.). Nesse caso especifico, espera mais.
 * Só entram palavras ja confirmadas na gramatica (DECOYS/COMMAND_PHRASES
 * acima) — "pra" (colonial, citado no relato do usuario) ficou de fora por
 * nao ter confirmacao de vocabulario no modelo pt, mesma regra ja usada pra
 * WAKE_SUFFIX_WORDS: melhor perder essa forma do que arriscar "Ignoring word
 * missing in vocabulary" silencioso.
 */
const TRAILING_CONNECTOR_WORDS = new Set(['de', 'da', 'do', 'em', 'para', 'com']);
/** Janela quando a fala termina em conector (comentário acima). */
const CONNECTOR_SILENCE_MS = 1500;

/** Escolhe o teto de silêncio certo para o texto ouvido até agora. */
function silenceWindowFor(text: string): number {
  const words = text.trim().split(/\s+/);
  const last = words[words.length - 1] ?? '';
  return TRAILING_CONNECTOR_WORDS.has(last) ? CONNECTOR_SILENCE_MS : COMMAND_SILENCE_MS;
}

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

/**
 * Padrão do ramo JÁ ARMADO: reconhece só o RESÍDUO da wake word no início do
 * texto, para quando o Vosk revisa a transcrição entre a parcial e a final.
 *
 * Log real (01/09): parcial "ei argos" arma a captura (wake=true); a passada
 * FINAL revisa o mesmo trecho para "e argos". No ramo já armado, findWakeEnd
 * (que só reconhece os prefixos de WAKE_PREFIX_WORDS: ei/ola/ok/oi) não bate
 * em "e", então o texto inteiro "e argos" virava o comando enviado, perdendo
 * o resto da fala ("ENVIANDO comando: \"e argos\"").
 *
 * Diferente de buildWakePatterns (ramo NÃO-armado, onde precisão alta evita
 * acordar sozinho), aqui a wake word JÁ foi confirmada — dá para usar
 * FIRST_ALT (generoso de propósito, ver comentário na constante) sem reabrir
 * a porta do falso positivo de ACORDAR: essa regra não decide se acorda, só
 * descarta lixo que sobrou da wake word depois de já ter acordado.
 */
function buildResiduePattern(wakeWord: string): RegExp {
  const full = normalize(wakeWord);
  const parts = full.split(/\s+/).filter(Boolean);
  const name = parts.length > 1 ? parts[parts.length - 1] : full;
  const nameAlt = name === 'argos' ? NAME_ALT : '(?:' + name + ')';
  return new RegExp('^\\s*' + FIRST_ALT + '\\s+' + nameAlt + '(?![a-z])', 'i');
}

/**
 * Índice onde termina um resíduo de wake word no início de `heard`, ou -1.
 * Só deve ser consultado quando findWakeEnd já falhou (ramo já armado).
 */
function findResidueEnd(heard: string, pattern: RegExp): number {
  const m = pattern.exec(heard);
  return m ? m[0].length : -1;
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
let residuePattern: RegExp = buildResiduePattern('Ei Argos');
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
/** Quando a captura do comando começou (armed virou true), para medir duração. */
let armedAt = 0;

/*
 * A-044: heurísticas para registrar tentativas de voz provavelmente mal
 * entendidas, sem UI e sem áudio (ver suspiciousVoiceAttempts.ts). Não é
 * detecção de erro real — é sinal aproximado para curar a gramática (A-043)
 * com uso de verdade depois.
 */
// Falou por isto ou mais e o texto final ainda ficou curto: sinal de que a
// gramática fechada descartou boa parte do que foi dito.
const SUSPICIOUS_MIN_SPEECH_MS = 2500;
// "curto" aqui é o comprimento do texto final, não contagem de palavras —
// mais simples e já cobre o caso real (comando genuíno raramente cabe nisso
// se levou SUSPICIOUS_MIN_SPEECH_MS inteiros para ser dito).
const SUSPICIOUS_MAX_CHARS = 6;
// Nova wake word + comando chegando rápido depois do anterior: sinal comum
// de "ele não me entendeu, vou tentar de novo".
const REFORMULATION_WINDOW_MS = 15000;

let lastSubmitAt = 0;
let lastSubmitText = '';

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
  const now = Date.now();
  const speechMs = armedAt ? now - armedAt : 0;
  vlog('ENVIANDO comando: "' + text + '"');
  perfStart('fim_da_fala (silencio detectado)');

  if (speechMs >= SUSPICIOUS_MIN_SPEECH_MS && text.length <= SUSPICIOUS_MAX_CHARS) {
    void recordSuspiciousAttempt({ text, speechMs, reason: 'curta_para_duracao' });
  } else if (
    text &&
    lastSubmitAt &&
    now - lastSubmitAt <= REFORMULATION_WINDOW_MS &&
    text !== lastSubmitText
  ) {
    void recordSuspiciousAttempt({ text, speechMs, reason: 'reformulacao_rapida' });
  }
  lastSubmitAt = now;
  lastSubmitText = text;

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
    armedAt = Date.now();
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
    // Se já veio comando junto, corta no silêncio (mais tempo se terminar em
    // conector — ver silenceWindowFor); se não, espera um pouco mais.
    armSilence(lastCommand ? silenceWindowFor(lastCommand) : AWAIT_COMMAND_MS);
    return;
  }

  // Já acordado: tudo que vier é comando. A wake word pode reaparecer numa nova
  // transcrição depois de um restart do Vosk — nesse caso corta ela de novo.
  const end = findWakeEnd(heard, patterns);
  let piece: string;
  if (end >= 0) {
    piece = heard.slice(end).trim();
  } else {
    // findWakeEnd exige os prefixos precisos do ramo não-armado (ei/ola/ok/oi)
    // e falha quando o Vosk revisa a wake word para algo mais curto ("e argos").
    // Antes de aceitar o texto inteiro como comando, checa se não é só esse
    // resíduo — senão a wake word residual vira o comando enviado à IA.
    const residueEnd = findResidueEnd(heard, residuePattern);
    piece = (residueEnd >= 0 ? heard.slice(residueEnd) : heard).trim();
  }

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
    // Mais tempo se a fala terminar em conector — ver silenceWindowFor.
    armSilence(now ? silenceWindowFor(now) : AWAIT_COMMAND_MS);
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
  residuePattern = buildResiduePattern(opts.wakeWord || 'Ei Argos');
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
  armedAt = Date.now();
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
