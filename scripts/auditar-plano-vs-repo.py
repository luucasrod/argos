"""
Confronta as issues do plano com o que existe de verdade no repositório.

O plano foi escrito sem acesso ao código. Este script anexa a cada issue afetada
o que já existe, o que já foi decidido e o que não pode ser refeito — para o
agente não reinventar nem quebrar conhecimento comprado caro.
"""
import io, json, os, re, subprocess, tempfile

REPO = 'luucasrod/argos'
GH = r'C:\Program Files\GitHub CLI\gh.exe'
env = dict(os.environ)
env.pop('GITHUB_TOKEN', None); env.pop('GH_TOKEN', None)


def gh(args, **kw):
    return subprocess.run([GH] + args, capture_output=True, text=True,
                          encoding='utf-8', env=env, **kw)


# ── 1. dependem de Argos Home / Cloud, que ainda não nasceram ────────────────
AGUARDA_HOME = {
    'A-001': 'descoberta do Home na LAN',
    'B-001': 'o servidor local do Home',
    'B-002': 'o canal Home ↔ Cloud',
    'B-003': 'o relay na Cloud',
    'SOLO-004': 'teste ponta a ponta local e remoto',
    'B-011': 'protótipo Matter rodando no Home',
    'B-013': 'endpoint de áudio por cômodo no Home',
    'B-019': 'contexto de cômodo no Home',
    'B-023': 'self-healing do Home',
    'B-024': 'pareamento seguro do Home',
    'A-028': 'UX de pareamento do Home',
    'B-028': 'suíte de contrato Home/Cloud',
}

NOTA_HOME = """## ⏸️ Aguarda o Argos Home/Cloud existirem

Decisão do usuário em 31/08: **Argos Home e Argos Cloud ainda vão nascer.**

- **Argos Cloud** — servidor na nuvem com o qual o app já existente vai conversar.
- **Argos Home** — um **aparelho físico para a casa**, no espírito de um Alexa,
  com o Argos dentro. Painel central, não um app.

Nenhum dos dois existe hoje: o repositório é **um único app Expo** mais funções
serverless em `api/`. Esta issue depende de {o_que} e **não é executável agora**.

**Não comece.** Marcada `status:blocked` + `aguarda-argos-home`. Será desbloqueada
quando o usuário decidir criar esses componentes.

Se algo aqui puder ser **preparado** sem criar o componente (um contrato, um tipo,
uma interface), isso já está coberto pela SOLO-001 (#41) — não duplique."""

# ── 2. já existe base no repo; refazer do zero é retrabalho ──────────────────
JA_EXISTE = {
 'B-027': ('Semantic Alias Engine',
  'Já existe **`services/voice/deviceVoiceAliases.ts`** (mergeado em 31/08), com '
  '`getSpeakableDeviceAlias()` e `resolveDeviceVoiceAlias()`. Ele resolve o caso '
  'real que motivou tudo: palavras que **não existem no vocabulário fechado do '
  'Vosk** (`tv`, `4k`, `speaker`, `standing`, `ar-condicionado`, `2`) viravam '
  'aparelho impossível de chamar por voz.\n\n'
  'Esta issue deve **estender**, não substituir. E leia a regra do acento em '
  '`docs/ai/CONTEXT.md` antes de tocar em gramática.'),
 'A-033': ('UX de apelidos',
  'O mecanismo já existe (`deviceVoiceAliases.ts`) e a dica `· diga "..."` já '
  'aparece em **`app/(tabs)/casa.tsx`**.\n\n'
  '⚠️ **Não coloque UI em `app/(tabs)/devices.tsx`** — essa tela tem `href: null` '
  'no `_layout.tsx` e **não aparece para o usuário**. Já erramos isso uma vez.'),
 'A-012': ('Tela Casa',
  'A tela já existe: **`app/(tabs)/casa.tsx`**, com cômodos, renomear por toque '
  'longo, status online/offline e controles por capability. Esta issue é '
  '**evolução**, não criação.'),
 'A-013': ('Tela de integrações',
  'Já existe **`app/(modals)/integracoes.tsx`** com 8 cartões (eWeLink, Tuya, WiZ, '
  'Tapo, Xiaomi, Alexa, Home Assistant, Google Home). O que falta de verdade é a '
  'parte de **saúde/diagnóstico**, não os cartões.'),
 'B-009': ('Adapter Home Assistant',
  '⚠️ Hoje o Home Assistant é **unidirecional: HA → Argos**. O HA manda texto para '
  '`api/ha.ts` com a chave gerada no app, e o Argos executa nas integrações que '
  '**ele** conhece. O app **não lê nem controla** entidades do HA.\n\n'
  'Esta issue inverte isso (Argos → HA). É trabalho novo de verdade, mas leia '
  '`api/ha.ts` e `services/ha/haService.ts` antes para não duplicar a camada de chave.'),
 'B-014': ('Serviço de memória',
  'Já existem **`stores/useMemoryStore.ts`** (fluxo pending/confirmed/rejected, '
  'sincronizado com Supabase) e **`services/ai/memorySelection.ts`** (mergeado em '
  '31/08: seleção por relevância, teto de 12 memórias / 2400 caracteres).\n\n'
  'Esta issue é o **serviço**, não o armazenamento. Não recrie o store.'),
 'A-022': ('Resposta curta por padrão',
  'Parcialmente feito em **`services/ai/fastIntentSpeech.ts`** (31/08): frases '
  'curtas e variadas para o caminho rápido.\n\n'
  '⚠️ **Regra que não pode ser perdida**: comando simples é resolvido por '
  '`matchFastDeviceCommand` **sem chamar o LLM** — é daí que vem a velocidade. '
  'A personalidade vive no prompt do modelo e **não alcança esse caminho**, então '
  'toda resposta nova ali precisa passar por `fastIntentSpeech.ts`.'),
 'A-023': ('Personalidade adaptativa',
  'A personalidade já existe em **`services/ai/systemPrompt.ts`**: tom Jarvis, '
  'chama o usuário de "senhor", humor. E em `fastIntentSpeech.ts` para o caminho '
  'rápido. `useSettingsStore` já tem `tone`, `verbosity`, `voiceGender`, '
  '`voiceSpeed`.\n\nEsta issue é tornar isso **configurável e adaptativo** — não '
  'criar personalidade do zero.'),
 'A-034': ('Suíte de regressão',
  '⚠️ **Não existe teste automatizado nenhum no projeto hoje.** Não há runner, não '
  'há configuração. A única verificação é `npx tsc --noEmit` (baseline ZERO desde '
  '31/08) e a CI em `.github/workflows/typecheck.yml`.\n\nEsta issue começa do zero '
  'e precisa escolher o runner. Decisão de infraestrutura: registre a escolha.'),
}

# ── 3. wake word: conhecimento comprado caro que não pode ser perdido ────────
NOTA_VOZ = """## ⚠️ Antes de tocar no pipeline de voz — conhecimento comprado caro

Leia a seção **"Voz — arquitetura"** do `docs/ai/CONTEXT.md` inteira. O resumo do
que **não pode ser desfeito**:

**Um único `AudioRecord`, sempre com gramática, que nunca é fechado.**
Já foi tentado fechar o microfone e reabrir noutro modo: o Android **nega** abrir
microfone novo com o app em background. O áudio morria e não voltava.
→ **Nunca crie um segundo `AudioRecord`.**

**STT de texto livre não funciona.** O modelo pequeno nunca produz "argos" — a voz
real saiu como `erros`, `e aguas`, `em angulos`. Gramática fechada é obrigatória.

**Acento na gramática é regra dura.** O vocabulário do modelo pt (99.101 palavras)
guarda as formas **acentuadas**; mandar `escritorio` faz o Vosk descartar a entrada
em silêncio e a palavra vira impossível de falar. Use `toGrammar()` (mantém acento)
para a gramática e `normalize()` (remove) só para comparar.

**Falso positivo é decisão de produto.** O usuário prefere **perder chamadas** a ter
o Argos respondendo sozinho. `WAKE_PREFIX_WORDS` é `['ei','ola','ok','oi']` — `'e'`
e `'a'` foram removidos porque vogais soltas disparavam à toa. Em 31/08 ele disse
que ficou exigente e **mesmo assim preferiu manter**. Não afrouxe sem pedir.

Arquivo central: `services/voice/voskWakeWord.native.ts`."""

VOZ = ['A-003', 'A-004', 'A-005', 'A-006', 'A-010', 'A-011']


def main():
    out = gh(['issue', 'list', '--repo', REPO, '--state', 'open', '--limit', '400',
              '--json', 'number,title'])
    mapa = {}
    for it in json.loads(out.stdout):
        m = re.match(r'^\[((?:SOLO|A|B)-\d{3})\]', it['title'])
        if m:
            mapa[m.group(1)] = it['number']

    def comentar(pid, corpo):
        num = mapa.get(pid)
        if not num:
            print(f'  {pid}: SEM issue'); return
        fd, path = tempfile.mkstemp(suffix='.json')
        with io.open(fd, 'w', encoding='utf-8') as f:
            json.dump({'body': corpo}, f, ensure_ascii=False)
        r = gh(['api', '-X', 'POST', f'repos/{REPO}/issues/{num}/comments', '--input', path])
        os.unlink(path)
        print(f'  #{num} {pid}: {"ok" if r.returncode == 0 else "ERRO " + r.stderr[:60]}')
        return num

    print('== aguardam Argos Home/Cloud ==')
    for pid, oque in AGUARDA_HOME.items():
        num = comentar(pid, NOTA_HOME.format(o_que=oque))
        if num:
            gh(['issue', 'edit', str(num), '--repo', REPO,
                '--add-label', 'aguarda-argos-home,status:blocked',
                '--remove-label', 'status:ready'])

    print('== ja existe base no repo ==')
    for pid, (tema, texto) in JA_EXISTE.items():
        comentar(pid, f'## 🔎 Já existe no repositório — {tema}\n\n{texto}\n\n'
                      f'*Auditoria do plano contra o código real, 31/08. O plano foi '
                      f'escrito sem acesso ao repositório.*')

    print('== pipeline de voz ==')
    for pid in VOZ:
        comentar(pid, NOTA_VOZ)


if __name__ == '__main__':
    main()
