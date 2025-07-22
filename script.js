// Configuração global
const CONFIG = {
  STORAGE_KEY: 'chord-transposer-data',
  DEBOUNCE_DELAY: 300,
  ANIMATION_DURATION: 300
};

// Notas cromáticas para transposição
// Cada objeto contém a notação com sustenido (s) e bemol (b)
const notasCromaticasSimples = [
  {s: "C", b: "C"},
  {s: "C#", b: "Db"},
  {s: "D", b: "D"},
  {s: "D#", b: "Eb"},
  {s: "E", b: "E"},
  {s: "F", b: "F"},
  {s: "F#", b: "Gb"},
  {s: "G", b: "G"},
  {s: "G#", b: "Ab"},
  {s: "A", b: "A"},
  {s: "A#", b: "Bb"},
  {s: "B", b: "B"}
];

// Lista de todas as notas válidas (sustenidos e bemóis) para facilitar a busca
const notasValidasSimples = notasCromaticasSimples.flatMap(n => [n.s, n.b]);

// Estado da aplicação
let appState = {
  currentSection: 'simples',
  sections: [], // Usado para o transpositor com partes
  lastTransposition: null // Armazena a última transposição para referência
};

// Utilitários gerais da aplicação
const utils = {
  // Função debounce para otimizar a performance de funções que disparam repetidamente
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },

  // Exibe o overlay de carregamento
  showLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
      overlay.classList.add('active');
    }
  },

  // Esconde o overlay de carregamento
  hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
      overlay.classList.remove('active');
    }
  },

  // Salva o estado da aplicação no localStorage
  saveToStorage() {
    try {
      localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(appState));
    } catch (e) {
      console.warn('Não foi possível salvar no localStorage:', e);
    }
  },

  // Carrega o estado da aplicação do localStorage
  loadFromStorage() {
    try {
      const saved = localStorage.getItem(CONFIG.STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        // Mescla o estado salvo com o estado inicial, garantindo que novas propriedades sejam mantidas
        appState = { ...appState, ...data };
      }
    } catch (e) {
      console.warn('Não foi possível carregar do localStorage:', e);
    }
  },

  // Exibe notificações para o usuário (sucesso, erro, informação)
  showNotification(message, type = 'info', duration = 3000) {
    const notificationContainer = document.getElementById('notificationContainer');
    if (!notificationContainer) {
      console.warn('Contêiner de notificação não encontrado.');
      return;
    }

    const notification = document.createElement('div');
    notification.className = `notification ${type} animate-in`;
    notification.textContent = message;

    notificationContainer.appendChild(notification);

    // Remove a notificação após a duração especificada
    setTimeout(() => {
      notification.classList.remove('animate-in');
      notification.classList.add('animate-out');
      notification.addEventListener('animationend', () => {
        notification.remove();
      }, { once: true });
    }, duration);
  }
};

// Módulo de navegação entre seções
const navigation = {
  init() {
    const navLinks = document.querySelectorAll('.nav-link');
    const navToggle = document.querySelector('.nav-toggle');
    const navMenu = document.querySelector('.nav-menu');

    navLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const sectionId = link.getAttribute('data-section');
        navigation.showSection(sectionId);
        // Esconde o menu em mobile após a seleção
        if (navMenu && navToggle && navMenu.classList.contains('active')) {
          navMenu.classList.remove('active');
          navToggle.setAttribute('aria-expanded', 'false');
        }
      });
    });

    if (navToggle && navMenu) {
      navToggle.addEventListener('click', () => {
        const isExpanded = navToggle.getAttribute('aria-expanded') === 'true';
        navToggle.setAttribute('aria-expanded', String(!isExpanded));
        navMenu.classList.toggle('active');
      });
    }

    // Exibe a seção inicial ou a última salva
    navigation.showSection(appState.currentSection || 'simples');
  },

  // Mostra uma seção específica e esconde as outras
  showSection(sectionId) {
    const sections = document.querySelectorAll('.section');
    sections.forEach(section => {
      section.classList.remove('active');
      section.setAttribute('aria-hidden', 'true');
    });

    const activeSection = document.getElementById(sectionId);
    if (activeSection) {
      activeSection.classList.add('active');
      activeSection.setAttribute('aria-hidden', 'false');
      appState.currentSection = sectionId;
      utils.saveToStorage();
    }
  }
};

// Módulo de lógica de transposição central
const transposition = {
  // Popula os selects de tom (origem e destino)
  populateKeySelects() {
    const keySelects = document.querySelectorAll('.key-select');
    notasCromaticasSimples.forEach(nota => {
      const optionSustenido = document.createElement('option');
      optionSustenido.value = nota.s;
      optionSustenido.textContent = nota.s;

      const optionBemol = document.createElement('option');
      optionBemol.value = nota.b;
      optionBemol.textContent = nota.b;

      keySelects.forEach(select => {
        // Evita duplicatas se já existirem
        if (!Array.from(select.options).some(opt => opt.value === nota.s)) {
          select.appendChild(optionSustenido.cloneNode(true));
        }
        if (nota.s !== nota.b && !Array.from(select.options).some(opt => opt.value === nota.b)) {
          select.appendChild(optionBemol.cloneNode(true));
        }
      });
    });
  },

  // Valida se uma nota é reconhecida pelo sistema
  isValidNote(note) {
    return notasValidasSimples.includes(note);
  },

  // Transpõe um único acorde
  // ATENÇÃO: Esta função realiza APENAS TRANSPOSIÇÃO CROMÁTICA.
  // Ela desloca a nota raiz do acorde por um número de semitons,
  // mantendo a qualidade do acorde (maior, menor, 7ª, etc.).
  // Não há lógica para converter acordes entre modos (ex: de Fm para F Maior),
  // pois isso exige uma análise harmônica e funcional mais complexa.
  transposeChord(chord, origem, destino, preferencia) {
    if (!chord || !origem || !destino) return chord;

    // Expressão regular para separar a nota raiz do sufixo do acorde
    // Ex: "Am7" -> "A" (nota), "m7" (sufixo)
    // Ex: "C#" -> "C#" (nota), "" (sufixo)
    // Ex: "G/B" -> "G" (nota), "/B" (sufixo)
    const match = chord.match(/^([A-G][#b]?)(.*)$/);
    if (!match) return chord; // Não é um acorde reconhecível

    let nota = match[1];
    let sufixo = match[2];

    // Encontra o índice da nota de origem na escala cromática
    let origemIndice = -1;
    for (let i = 0; i < notasCromaticasSimples.length; i++) {
      if (notasCromaticasSimples[i].s === origem || notasCromaticasSimples[i].b === origem) {
        origemIndice = i;
        break;
      }
    }

    // Encontra o índice da nota de destino na escala cromática
    let destinoIndice = -1;
    for (let i = 0; i < notasCromaticasSimples.length; i++) {
      if (notasCromaticasSimples[i].s === destino || notasCromaticasSimples[i].b === destino) {
        destinoIndice = i;
        break;
      }
    }

    // Encontra o índice da nota atual do acorde na escala cromática
    let indiceAtual = -1;
    for (let i = 0; i < notasCromaticasSimples.length; i++) {
      if (notasCromaticasSimples[i].s === nota || notasCromaticasSimples[i].b === nota) {
        indiceAtual = i;
        break;
      }
    }

    if (origemIndice === -1 || destinoIndice === -1 || indiceAtual === -1) {
      return chord; // Notas de origem/destino ou acorde não encontrados
    }

    // Calcula o deslocamento (intervalo)
    const deslocamento = (destinoIndice - origemIndice + 12) % 12;

    // Calcula o novo índice do acorde transposto
    const transpostoIndice = (indiceAtual + deslocamento + 12) % 12;

    // Obtém a nova nota transposta com base na preferência (sustenido/bemol)
    let novaNota = preferencia === "bemol"
      ? notasCromaticasSimples[transpostoIndice].b
      : notasCromaticasSimples[transpostoIndice].s;

    return novaNota + sufixo;
  }
};

// Módulo para o transpositor simples
const simpleTransposer = {
  inputElement: null,
  outputElement: null,
  keyOriginSelect: null,
  keyDestinationSelect: null,
  preferenceSelect: null,
  debouncedTranspose: null,

  init() {
    this.inputElement = document.getElementById('acordesSimplesInput');
    this.outputElement = document.getElementById('resultadoSimples');
    this.keyOriginSelect = document.getElementById('tomOrigemSimples');
    this.keyDestinationSelect = document.getElementById('tomDestinoSimples');
    this.preferenceSelect = document.getElementById('preferenciaSimples');

    this.debouncedTranspose = utils.debounce(this.transpose.bind(this), CONFIG.DEBOUNCE_DELAY);

    this.inputElement.addEventListener('input', this.debouncedTranspose);
    this.keyOriginSelect.addEventListener('change', this.debouncedTranspose);
    this.keyDestinationSelect.addEventListener('change', this.debouncedTranspose);
    this.preferenceSelect.addEventListener('change', this.debouncedTranspose);

    // Carregar último estado e transpor
    if (appState.lastTransposition && appState.lastTransposition.simple) {
      this.inputElement.value = appState.lastTransposition.simple.input;
      this.keyOriginSelect.value = appState.lastTransposition.simple.originKey;
      this.keyDestinationSelect.value = appState.lastTransposition.simple.destKey;
      this.preferenceSelect.value = appState.lastTransposition.simple.preference;
      this.transpose(); // Transpõe imediatamente ao carregar
    }
  },

  transpose() {
    utils.showLoading();
    const acordesInput = this.inputElement.value.trim();
    const origem = this.keyOriginSelect.value;
    const destino = this.keyDestinationSelect.value;
    const preferencia = this.preferenceSelect.value;

    if (!acordesInput) {
      this.outputElement.textContent = '';
      utils.hideLoading();
      return;
    }

    if (!transposition.isValidNote(origem) || !transposition.isValidNote(destino)) {
      utils.showNotification('Selecione tons de origem e destino válidos.', 'error');
      this.outputElement.textContent = 'Erro: Selecione tons válidos.';
      utils.hideLoading();
      return;
    }

    // Expressão regular para encontrar acordes:
    // Procura por uma nota (C, D, E, F, G, A, B, com ou sem #/b)
    // seguida por qualquer combinação de letras, números, '/', '+', '-', 'o', 'Δ'
    // que compõem um sufixo de acorde, até um espaço ou fim de linha.
    // Garante que não capture letras de palavras.
    const chordRegex = new RegExp(
      `\\b([A-G][#b]?)(m(?:aj|in)?|M|dim|aug|sus\\d*|add\\d*|\\d+(?:sus\\d*)?|[+-oΔ])*(?:\\/[A-G][#b]?)?\\b(?![a-zA-Z])`,
      'g'
    );


    const acordesTranspostos = acordesInput.split(/\s+/).map(acorde => {
      // Verifica se o "acorde" atual realmente corresponde a um padrão de acorde
      const match = acorde.match(chordRegex);
      if (match && match[0] === acorde) { // Garante que a correspondência seja exata para o "acorde"
        return transposition.transposeChord(acorde, origem, destino, preferencia);
      }
      return acorde; // Retorna o texto original se não for um acorde
    }).join(' ');

    this.outputElement.textContent = acordesTranspostos;
    utils.hideLoading();

    // Salvar estado
    appState.lastTransposition = appState.lastTransposition || {};
    appState.lastTransposition.simple = {
      input: acordesInput,
      originKey: origem,
      destKey: destino,
      preference: preferencia
    };
    utils.saveToStorage();
  }
};

// Módulo para o transpositor com partes da música
const partsTransposer = {
  sectionsContainer: null,
  addSectionButton: null,
  transposeAllButton: null,
  sectionTemplate: null,
  keyOriginSelect: null,
  keyDestinationSelect: null,
  preferenceSelect: null,

  init() {
    this.sectionsContainer = document.getElementById('sectionsContainer');
    this.addSectionButton = document.getElementById('addSectionButton');
    this.transposeAllButton = document.getElementById('transposeAllButton');
    this.sectionTemplate = document.getElementById('sectionTemplate');
    this.keyOriginSelect = document.getElementById('tomOrigemPartes');
    this.keyDestinationSelect = document.getElementById('tomDestinoPartes');
    this.preferenceSelect = document.getElementById('preferenciaPartes');

    this.addSectionButton.addEventListener('click', () => this.addSection());
    this.transposeAllButton.addEventListener('click', () => this.transposeAll());
    this.keyOriginSelect.addEventListener('change', utils.debounce(this.transposeAll.bind(this), CONFIG.DEBOUNCE_DELAY));
    this.keyDestinationSelect.addEventListener('change', utils.debounce(this.transposeAll.bind(this), CONFIG.DEBOUNCE_DELAY));
    this.preferenceSelect.addEventListener('change', utils.debounce(this.transposeAll.bind(this), CONFIG.DEBOUNCE_DELAY));

    // Carregar seções salvas
    if (appState.sections && appState.sections.length > 0) {
      appState.sections.forEach(sectionData => this.addSection(sectionData));
      // Transpõe todas as seções ao carregar se houver dados
      this.transposeAll();
    } else {
      this.addSection(); // Adiciona uma seção vazia se não houver dados salvos
    }
  },

  addSection(sectionData = { name: '', chords: '', transposedChords: '' }) {
    const newSection = this.sectionTemplate.content.cloneNode(true);
    const sectionDiv = newSection.querySelector('.section-item');
    const sectionNameInput = sectionDiv.querySelector('.section-name-input');
    const chordsInput = sectionDiv.querySelector('.chords-input');
    const transposedOutput = sectionDiv.querySelector('.transposed-chords-output');
    const removeButton = sectionDiv.querySelector('.remove-section-button');

    sectionNameInput.value = sectionData.name;
    chordsInput.value = sectionData.chords;
    transposedOutput.textContent = sectionData.transposedChords;

    // Adiciona um ID único para cada seção
    const sectionId = `section-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    sectionDiv.id = sectionId;

    // Event listeners para inputs e botões
    sectionNameInput.addEventListener('input', utils.debounce(() => {
      this.updateSectionData(sectionId, 'name', sectionNameInput.value);
      this.transposeAll();
    }, CONFIG.DEBOUNCE_DELAY));
    chordsInput.addEventListener('input', utils.debounce(() => {
      this.updateSectionData(sectionId, 'chords', chordsInput.value);
      this.transposeAll();
    }, CONFIG.DEBOUNCE_DELAY));
    removeButton.addEventListener('click', () => this.removeSection(sectionId));

    this.sectionsContainer.appendChild(newSection);

    // Se for uma nova seção, adiciona ao appState
    if (!sectionData.id) { // Verifica se é uma nova seção ou carregada do storage
      appState.sections.push({
        id: sectionId,
        name: sectionNameInput.value,
        chords: chordsInput.value,
        transposedChords: transposedOutput.textContent
      });
      utils.saveToStorage();
    }
  },

  updateSectionData(sectionId, key, value) {
    const sectionIndex = appState.sections.findIndex(s => s.id === sectionId);
    if (sectionIndex !== -1) {
      appState.sections[sectionIndex][key] = value;
      utils.saveToStorage();
    }
  },

  removeSection(sectionId) {
    const sectionDiv = document.getElementById(sectionId);
    if (sectionDiv) {
      sectionDiv.classList.add('animate-out');
      sectionDiv.addEventListener('animationend', () => {
        sectionDiv.remove();
        appState.sections = appState.sections.filter(s => s.id !== sectionId);
        utils.saveToStorage();
        utils.showNotification('Seção removida.', 'info');
      }, { once: true });
    }
  },

  transposeAll() {
    utils.showLoading();
    const origem = this.keyOriginSelect.value;
    const destino = this.keyDestinationSelect.value;
    const preferencia = this.preferenceSelect.value;

    if (!transposition.isValidNote(origem) || !transposition.isValidNote(destino)) {
      utils.showNotification('Selecione tons de origem e destino válidos.', 'error');
      utils.hideLoading();
      return;
    }

    // Expressão regular para encontrar acordes (a mesma do transpositor simples)
    const chordRegex = new RegExp(
      `\\b([A-G][#b]?)(m(?:aj|in)?|M|dim|aug|sus\\d*|add\\d*|\\d+(?:sus\\d*)?|[+-oΔ])*(?:\\/[A-G][#b]?)?\\b(?![a-zA-Z])`,
      'g'
    );


    appState.sections.forEach(section => {
      const chordsInput = section.chords.trim();
      if (!chordsInput) {
        section.transposedChords = '';
        return;
      }

      const transposed = chordsInput.split(/\s+/).map(acorde => {
        const match = acorde.match(chordRegex);
        if (match && match[0] === acorde) {
          return transposition.transposeChord(acorde, origem, destino, preferencia);
        }
        return acorde;
      }).join(' ');
      section.transposedChords = transposed;

      // Atualiza o DOM
      const sectionDiv = document.getElementById(section.id);
      if (sectionDiv) {
        sectionDiv.querySelector('.transposed-chords-output').textContent = transposed;
      }
    });
    utils.hideLoading();
    utils.saveToStorage();
    utils.showNotification('Todas as seções transpostas!', 'success');
  }
};

// Módulo para o transpositor de cifra completa
const fullChordTransposer = {
  inputElement: null,
  outputElement: null,
  keyOriginSelect: null,
  keyDestinationSelect: null,
  preferenceSelect: null,
  debouncedTranspose: null,

  init() {
    this.inputElement = document.getElementById('cifraCompletaInput');
    this.outputElement = document.getElementById('resultadoCifra');
    this.keyOriginSelect = document.getElementById('tomOrigemCifra');
    this.keyDestinationSelect = document.getElementById('tomDestinoCifra');
    this.preferenceSelect = document.getElementById('preferenciaCifra');

    this.debouncedTranspose = utils.debounce(this.transpose.bind(this), CONFIG.DEBOUNCE_DELAY);

    this.inputElement.addEventListener('input', this.debouncedTranspose);
    this.keyOriginSelect.addEventListener('change', this.debouncedTranspose);
    this.keyDestinationSelect.addEventListener('change', this.debouncedTranspose);
    this.preferenceSelect.addEventListener('change', this.debouncedTranspose);

    // Carregar último estado e transpor
    if (appState.lastTransposition && appState.lastTransposition.full) {
      this.inputElement.value = appState.lastTransposition.full.input;
      this.keyOriginSelect.value = appState.lastTransposition.full.originKey;
      this.keyDestinationSelect.value = appState.lastTransposition.full.destKey;
      this.preferenceSelect.value = appState.lastTransposition.full.preference;
      this.transpose(); // Transpõe imediatamente ao carregar
    }
  },

  transpose() {
    utils.showLoading();
    const cifraCompleta = this.inputElement.value;
    const origem = this.keyOriginSelect.value;
    const destino = this.keyDestinationSelect.value;
    const preferencia = this.preferenceSelect.value;

    if (!cifraCompleta) {
      this.outputElement.textContent = '';
      utils.hideLoading();
      return;
    }

    if (!transposition.isValidNote(origem) || !transposition.isValidNote(destino)) {
      utils.showNotification('Selecione tons de origem e destino válidos.', 'error');
      this.outputElement.textContent = 'Erro: Selecione tons válidos.';
      utils.hideLoading();
      return;
    }

    // Regex para identificar acordes na cifra completa.
    // Garante que a nota seja seguida por um sufixo de acorde válido
    // ou por um espaço/fim de linha, para evitar que palavras sejam transpostas.
    // ATENÇÃO: Esta regex foi aprimorada para ser mais específica e evitar
    // que letras de músicas sejam confundidas com sufixos de acordes.
    // Ela busca:
    // 1. Uma nota raiz (A-G com ou sem #/b).
    // 2. Um grupo opcional de caracteres que representam sufixos comuns de acordes
    //    (m, maj, min, dim, aug, sus, add, números, +, -, o, Δ).
    // 3. Um grupo opcional para a nota do baixo (ex: /G).
    // As bordas de palavra (\b) ajudam a garantir que apenas "palavras" que começam
    // com uma nota e têm um sufixo de acorde sejam consideradas.
    // O uso de `(?:...)` cria grupos não-capturantes para partes da regex que não
    // precisam ser extraídas separadamente.
    // O `(?![a-zA-Z])` (negative lookahead) garante que o que segue o acorde NÃO seja uma letra.
    const chordRegex = new RegExp(
      `\\b([A-G][#b]?)(?:m(?:aj|in)?|M|dim|aug|sus\\d*|add\\d*|\\d+(?:sus\\d*)?|[+-oΔ])*(?:\\/[A-G][#b]?)?\\b(?![a-zA-Z])`,
      'g'
    );


    const resultado = cifraCompleta.replace(chordRegex, (fullMatch, nota, sufixo) => {
      // Se a nota não for válida, retorna o fullMatch original para não alterar
      if (!transposition.isValidNote(nota)) {
        return fullMatch;
      }
      return transposition.transposeChord(fullMatch, origem, destino, preferencia);
    });

    this.outputElement.textContent = resultado;
    utils.hideLoading();

    // Salvar estado
    appState.lastTransposition = appState.lastTransposition || {};
    appState.lastTransposition.full = {
      input: cifraCompleta,
      originKey: origem,
      destKey: destino,
      preference: preferencia
    };
    utils.saveToStorage();
  },

  copy() {
    const texto = this.outputElement.textContent;
    if (!texto.trim()) {
      utils.showNotification("Não há cifra para copiar.", 'warning');
      return;
    }
    // Usar document.execCommand('copy') para maior compatibilidade em iframes
    const textarea = document.createElement('textarea');
    textarea.value = texto;
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      utils.showNotification("Cifra copiada para a área de transferência!", 'success');
    } catch (err) {
      console.error('Falha ao copiar:', err);
      utils.showNotification("Falha ao copiar a cifra.", 'error');
    } finally {
      document.body.removeChild(textarea);
    }
  },

  exportPdf() {
    const cifra = this.outputElement.textContent;
    if (!cifra.trim()) {
      utils.showNotification("Não há cifra para exportar.", 'warning');
      return;
    }

    try {
      const printWindow = window.open("", "_blank");
      printWindow.document.write(`
        <html>
        <head>
          <title>Exportar Cifra</title>
          <style>
            body {
              font-family: monospace;
              white-space: pre-wrap;
              padding: 20px;
              font-size: 1rem;
              line-height: 1.5;
            }
            @media print {
              body {
                font-size: 10pt; /* Tamanho de fonte para impressão */
              }
            }
          </style>
        </head>
        <body>
          <pre>${cifra}</pre>
          <script>
            // Fecha a janela após a impressão para navegadores que suportam
            window.onload = function() {
              window.print();
              setTimeout(() => window.close(), 1000);
            }
          </script>
        </body>
        </html>
      `);
      printWindow.document.close(); // Fecha o documento para garantir que o conteúdo seja renderizado

      utils.showNotification("Abrindo janela de impressão...");

    } catch (error) {
      utils.showNotification("Erro ao exportar PDF.", 'error');
      console.error("Erro ao exportar PDF:", error);
    }
  }
};

// Inicialização da aplicação
document.addEventListener('DOMContentLoaded', () => {
  // Carregar dados salvos do localStorage
  utils.loadFromStorage();

  // Inicializar módulos
  navigation.init();
  transposition.populateKeySelects();
  simpleTransposer.init();
  partsTransposer.init();
  fullChordTransposer.init();

  // Esconder o overlay de carregamento inicial
  utils.hideLoading();

  console.log('🎵 Transpositores de Acordes carregado com sucesso!');
});

// Funções globais para compatibilidade (caso sejam chamadas diretamente do HTML)
// É uma boa prática usar os módulos diretamente, mas estas são para retrocompatibilidade.
function mostrar(sectionId) {
  navigation.showSection(sectionId);
}

function transporSimples() {
  simpleTransposer.transpose();
}

function adicionarSecao() {
  partsTransposer.addSection();
}

function transporTodas() {
  partsTransposer.transposeAll();
}

function transporCifra() {
  fullChordTransposer.transpose();
}

function copiarCifra() {
  fullChordTransposer.copy();
}

function exportarPdf() {
  fullChordTransposer.exportPdf();
}

// Exportar para uso global se necessário (para depuração ou integração externa)
window.ChordTransposer = {
  utils,
  navigation,
  transposition,
  simpleTransposer,
  partsTransposer,
  fullChordTransposer,
  appState // Expor o estado para depuração
};
