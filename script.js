// Configuração global
const CONFIG = {
  STORAGE_KEY: 'chord-transposer-data',
  DEBOUNCE_DELAY: 300,
  ANIMATION_DURATION: 300
};

// Notas cromáticas para transposição
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

const notasValidasSimples = notasCromaticasSimples.flatMap(n => [n.s, n.b]);

// Estado da aplicação
let appState = {
  currentSection: 'simples',
  sections: [],
  lastTransposition: null
};

// Utilitários
const utils = {
  // Debounce para otimizar performance
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

  // Mostrar loading
  showLoading() {
    const overlay = document.getElementById('loadingOverlay');
    overlay.classList.add('active');
  },

  // Esconder loading
  hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    overlay.classList.remove('active');
  },

  // Salvar no localStorage
  saveToStorage() {
    try {
      localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(appState));
    } catch (e) {
      console.warn('Não foi possível salvar no localStorage:', e);
    }
  },

  // Carregar do localStorage
  loadFromStorage() {
    try {
      const saved = localStorage.getItem(CONFIG.STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        appState = { ...appState, ...data };
      }
    } catch (e) {
      console.warn('Não foi possível carregar do localStorage:', e);
    }
  },

  // Mostrar notificação
  showNotification(message, type = 'success') {
    // Criar elemento de notificação
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    // Estilos inline para a notificação
    Object.assign(notification.style, {
      position: 'fixed',
      top: '20px',
      right: '20px',
      padding: '12px 24px',
      borderRadius: '8px',
      color: 'white',
      fontWeight: '600',
      zIndex: '1001',
      transform: 'translateX(100%)',
      transition: 'transform 0.3s ease-in-out',
      backgroundColor: type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#06b6d4'
    });

    document.body.appendChild(notification);

    // Animar entrada
    setTimeout(() => {
      notification.style.transform = 'translateX(0)';
    }, 10);

    // Remover após 3 segundos
    setTimeout(() => {
      notification.style.transform = 'translateX(100%)';
      setTimeout(() => {
        document.body.removeChild(notification);
      }, 300);
    }, 3000);
  }
};

// Navegação
const navigation = {
  init() {
    // Toggle mobile menu
    const navToggle = document.querySelector('.nav-toggle');
    const navMenu = document.querySelector('.nav-menu');
    
    navToggle?.addEventListener('click', () => {
      const isExpanded = navToggle.getAttribute('aria-expanded') === 'true';
      navToggle.setAttribute('aria-expanded', !isExpanded);
      navMenu.classList.toggle('active');
    });

    // Navigation links
    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const sectionId = link.dataset.section;
        this.showSection(sectionId);
        
        // Fechar menu mobile
        navMenu.classList.remove('active');
        navToggle.setAttribute('aria-expanded', 'false');
      });
    });

    // Mostrar seção inicial
    this.showSection(appState.currentSection);
  },

  showSection(sectionId) {
    // Atualizar estado
    appState.currentSection = sectionId;
    utils.saveToStorage();

    // Esconder todas as seções
    document.querySelectorAll('.section').forEach(section => {
      section.classList.remove('active');
    });

    // Mostrar seção ativa
    const activeSection = document.getElementById(sectionId);
    if (activeSection) {
      activeSection.classList.add('active');
    }

    // Atualizar navegação
    document.querySelectorAll('.nav-link').forEach(link => {
      link.classList.remove('active');
    });
    
    const activeLink = document.querySelector(`[data-section="${sectionId}"]`);
    if (activeLink) {
      activeLink.classList.add('active');
    }
  }
};

// Transposição
const transposition = {
  // Preencher selects com tons
  populateKeySelects() {
    const selects = ['tomDestinoSimples', 'tomDestinoPartes', 'tomDestinoCifra'];
    
    selects.forEach(selectId => {
      const select = document.getElementById(selectId);
      if (!select) return;
      
      select.innerHTML = "";
      
      notasCromaticasSimples.forEach((nota, i) => {
        // Tom maior
        const optMaior = document.createElement("option");
        optMaior.value = i + "-M";
        optMaior.textContent = nota.s;
        select.appendChild(optMaior);
        
        // Tom menor
        const optMenor = document.createElement("option");
        optMenor.value = i + "-m";
        optMenor.textContent = nota.s + "m";
        select.appendChild(optMenor);
      });
      
      select.value = "0-M"; // C maior como padrão
    });
  },

  // Encontrar tom original
  findOriginalKey(chords) {
    for (let chord of chords) {
      const match = chord.match(/^([A-G](?:#|b)?)/);
      if (match && notasValidasSimples.includes(match[1])) {
        return notasCromaticasSimples.findIndex(n => 
          n.s === match[1] || n.b === match[1]
        );
      }
    }
    return -1;
  },

  // Transpor acorde individual
  transposeChord(chord, fromKey, toKey, preference) {
    const match = chord.match(/^([A-G](?:#|b)?)(.*)$/);
    if (!match) return chord;

    const [, note, suffix] = match;
    const originalIndex = notasCromaticasSimples.findIndex(n => 
      n.s === note || n.b === note
    );
    
    if (originalIndex === -1) return chord;

    const transposedIndex = (originalIndex - fromKey + toKey + 12) % 12;
    const newNote = preference === "bemol" 
      ? notasCromaticasSimples[transposedIndex].b
      : notasCromaticasSimples[transposedIndex].s;

    return newNote + suffix;
  },

  // Transpor lista de acordes
  transposeChords(chordsString, targetKey, preference) {
    const chords = chordsString.trim().split(/\s+/);
    if (chords.length === 0) return null;

    const originalKey = this.findOriginalKey(chords);
    if (originalKey === -1) {
      throw new Error("Não foi possível identificar o tom original.");
    }

    const [targetIndexStr] = targetKey.split("-");
    const targetIndex = parseInt(targetIndexStr);

    const transposedChords = chords.map(chord => 
      this.transposeChord(chord, originalKey, targetIndex, preference)
    );

    return transposedChords.join(" ");
  }
};

// Transpositor Simples
const simpleTransposer = {
  init() {
    const button = document.querySelector('button[onclick="transporSimples()"]');
    if (button) {
      button.removeAttribute('onclick');
      button.addEventListener('click', () => this.transpose());
    }

    // Auto-transpose on input change (debounced)
    const input = document.getElementById('inputAcordesSimples');
    if (input) {
      input.addEventListener('input', utils.debounce(() => {
        if (input.value.trim()) {
          this.transpose();
        }
      }, CONFIG.DEBOUNCE_DELAY));
    }
  },

  transpose() {
    try {
      utils.showLoading();
      
      const input = document.getElementById("inputAcordesSimples").value.trim();
      const targetKey = document.getElementById("tomDestinoSimples").value;
      const preference = document.getElementById("preferenciaSimples").value;
      const display = document.getElementById("acordesTranspostosSimples");

      if (!input) {
        display.textContent = "Digite alguns acordes para transpor...";
        display.style.background = "rgba(148, 163, 184, 0.1)";
        return;
      }

      const result = transposition.transposeChords(input, targetKey, preference);
      
      display.textContent = result;
      display.style.background = "rgba(6, 182, 212, 0.1)";
      
      // Salvar última transposição
      appState.lastTransposition = {
        type: 'simple',
        input,
        result,
        targetKey,
        preference,
        timestamp: Date.now()
      };
      utils.saveToStorage();
      
      utils.showNotification("Acordes transpostos com sucesso!");
      
    } catch (error) {
      const display = document.getElementById("acordesTranspostosSimples");
      display.textContent = error.message;
      display.style.background = "rgba(239, 68, 68, 0.1)";
      utils.showNotification(error.message, 'error');
    } finally {
      utils.hideLoading();
    }
  }
};

// Transpositor com Partes
const partsTransposer = {
  init() {
    // Botão adicionar seção
    const addButton = document.querySelector('button[onclick="adicionarSecao()"]');
    if (addButton) {
      addButton.removeAttribute('onclick');
      addButton.addEventListener('click', () => this.addSection());
    }

    // Botão transpor todas
    const transposeButton = document.querySelector('button[onclick="transporTodas()"]');
    if (transposeButton) {
      transposeButton.removeAttribute('onclick');
      transposeButton.addEventListener('click', () => this.transposeAll());
    }

    // Enter key nos inputs
    ['nomeSecao', 'acordesSecao'].forEach(id => {
      const input = document.getElementById(id);
      if (input) {
        input.addEventListener('keypress', (e) => {
          if (e.key === 'Enter') {
            this.addSection();
          }
        });
      }
    });

    // Renderizar seções salvas
    this.renderSections();
  },

  addSection() {
    const nameInput = document.getElementById("nomeSecao");
    const chordsInput = document.getElementById("acordesSecao");
    
    const name = nameInput.value.trim();
    const chords = chordsInput.value.trim();

    if (!name || !chords) {
      utils.showNotification("Preencha o nome da seção e os acordes.", 'error');
      return;
    }

    // Adicionar ao estado
    appState.sections.push({ name, chords, id: Date.now() });
    utils.saveToStorage();

    // Limpar inputs
    nameInput.value = "";
    chordsInput.value = "";

    // Re-renderizar
    this.renderSections();
    
    utils.showNotification(`Seção "${name}" adicionada!`);
  },

  removeSection(id) {
    appState.sections = appState.sections.filter(section => section.id !== id);
    utils.saveToStorage();
    this.renderSections();
    utils.showNotification("Seção removida!");
  },

  renderSections() {
    const container = document.getElementById("secoesContainer");
    if (!container) return;

    if (appState.sections.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 2rem; color: var(--gray-400);">
          <p>Nenhuma seção adicionada ainda.</p>
          <p>Adicione seções da sua música acima.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = appState.sections.map(section => `
      <div class="section-item" data-id="${section.id}">
        <div class="section-title">
          🎵 ${section.name}
          <button 
            onclick="partsTransposer.removeSection(${section.id})" 
            style="margin-left: auto; background: rgba(239, 68, 68, 0.2); color: #ef4444; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 12px;"
            title="Remover seção"
          >
            ✕
          </button>
        </div>
        <div class="section-result" id="resultado-${section.id}">${section.chords}</div>
      </div>
    `).join('');
  },

  transposeAll() {
    try {
      utils.showLoading();
      
      if (appState.sections.length === 0) {
        utils.showNotification("Adicione algumas seções primeiro.", 'error');
        return;
      }

      const targetKey = document.getElementById("tomDestinoPartes").value;
      const preference = document.getElementById("preferenciaPartes").value;

      // Encontrar tom original da primeira seção
      let originalKey = -1;
      for (let section of appState.sections) {
        const chords = section.chords.split(/\s+/);
        originalKey = transposition.findOriginalKey(chords);
        if (originalKey !== -1) break;
      }

      if (originalKey === -1) {
        throw new Error("Não foi possível identificar o tom original.");
      }

      const [targetIndexStr] = targetKey.split("-");
      const targetIndex = parseInt(targetIndexStr);

      // Transpor cada seção
      appState.sections.forEach(section => {
        const chords = section.chords.split(/\s+/);
        const transposedChords = chords.map(chord => 
          transposition.transposeChord(chord, originalKey, targetIndex, preference)
        );

        const resultElement = document.getElementById(`resultado-${section.id}`);
        if (resultElement) {
          resultElement.textContent = transposedChords.join(" ");
        }
      });

      utils.showNotification("Todas as seções foram transpostas!");
      
    } catch (error) {
      utils.showNotification(error.message, 'error');
    } finally {
      utils.hideLoading();
    }
  }
};

// Transpositor de Cifra Completa
const fullChordTransposer = {
  init() {
    // Botões
    const transposeButton = document.querySelector('button[onclick="transporCifra()"]');
    if (transposeButton) {
      transposeButton.removeAttribute('onclick');
      transposeButton.addEventListener('click', () => this.transpose());
    }

    const copyButton = document.querySelector('button[onclick="copiarCifra()"]');
    if (copyButton) {
      copyButton.removeAttribute('onclick');
      copyButton.addEventListener('click', () => this.copy());
    }

    const exportButton = document.querySelector('button[onclick="exportarPdf()"]');
    if (exportButton) {
      exportButton.removeAttribute('onclick');
      exportButton.addEventListener('click', () => this.exportPdf());
    }
  },

  transpose() {
    try {
      utils.showLoading();
      
      const input = document.getElementById("inputCifra").value.trim();
      const targetKey = document.getElementById("tomDestinoCifra").value;
      const preference = document.getElementById("preferenciaCifra").value;
      const display = document.getElementById("resultadoCifra");

      if (!input) {
        display.textContent = "Cole uma cifra completa para transpor...";
        return;
      }

      const [targetIndexStr] = targetKey.split("-");
      const targetIndex = parseInt(targetIndexStr);

      // Regex para detectar acordes
      const chordRegex = /([A-G](?:#|b)?)([^ \n\r]*)/g;

      // Encontrar tom original
      let originalKey = -1;
      let match;
      const tempRegex = new RegExp(chordRegex.source, chordRegex.flags);
      
      while ((match = tempRegex.exec(input)) && originalKey === -1) {
        if (notasValidasSimples.includes(match[1])) {
          originalKey = notasCromaticasSimples.findIndex(n => 
            n.s === match[1] || n.b === match[1]
          );
        }
      }

      if (originalKey === -1) {
        throw new Error("Não foi possível identificar o tom original da cifra.");
      }

      // Transpor toda a cifra
      const result = input.replace(chordRegex, (fullMatch, note, suffix) => {
        const noteIndex = notasCromaticasSimples.findIndex(n => 
          n.s === note || n.b === note
        );
        
        if (noteIndex === -1) return fullMatch;

        const transposedIndex = (noteIndex - originalKey + targetIndex + 12) % 12;
        const newNote = preference === "bemol" 
          ? notasCromaticasSimples[transposedIndex].b
          : notasCromaticasSimples[transposedIndex].s;

        return newNote + suffix;
      });

      display.textContent = result;
      utils.showNotification("Cifra transposta com sucesso!");
      
    } catch (error) {
      const display = document.getElementById("resultadoCifra");
      display.textContent = error.message;
      utils.showNotification(error.message, 'error');
    } finally {
      utils.hideLoading();
    }
  },

  async copy() {
    const text = document.getElementById("resultadoCifra").textContent;
    
    if (!text.trim() || text.includes("Cole uma cifra") || text.includes("Não foi possível")) {
      utils.showNotification("Não há cifra transposta para copiar.", 'error');
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      utils.showNotification("Cifra copiada para a área de transferência!");
    } catch (error) {
      // Fallback para navegadores mais antigos
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      utils.showNotification("Cifra copiada!");
    }
  },

  exportPdf() {
    const cifra = document.getElementById("resultadoCifra").textContent;
    
    if (!cifra.trim() || cifra.includes("Cole uma cifra") || cifra.includes("Não foi possível")) {
      utils.showNotification("Não há cifra transposta para exportar.", 'error');
      return;
    }

    try {
      const printWindow = window.open("", "_blank");
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Cifra Transposta</title>
          <style>
            body {
              font-family: 'Courier New', monospace;
              line-height: 1.6;
              padding: 20px;
              max-width: 800px;
              margin: 0 auto;
            }
            h1 {
              color: #333;
              border-bottom: 2px solid #333;
              padding-bottom: 10px;
            }
            pre {
              white-space: pre-wrap;
              word-wrap: break-word;
              background: #f5f5f5;
              padding: 20px;
              border-radius: 8px;
              border: 1px solid #ddd;
            }
            @media print {
              body { padding: 0; }
              h1 { color: black; }
            }
          </style>
        </head>
        <body>
          <h1>Cifra Transposta</h1>
          <pre>${cifra}</pre>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(() => window.close(), 1000);
            }
          </script>
        </body>
        </html>
      `);
      printWindow.document.close();
      
      utils.showNotification("Abrindo janela de impressão...");
      
    } catch (error) {
      utils.showNotification("Erro ao exportar PDF.", 'error');
    }
  }
};

// Inicialização da aplicação
document.addEventListener('DOMContentLoaded', () => {
  // Carregar dados salvos
  utils.loadFromStorage();
  
  // Inicializar módulos
  navigation.init();
  transposition.populateKeySelects();
  simpleTransposer.init();
  partsTransposer.init();
  fullChordTransposer.init();
  
  // Esconder loading inicial
  utils.hideLoading();
  
  console.log('🎵 Transpositores de Acordes carregado com sucesso!');
});

// Funções globais para compatibilidade (caso sejam chamadas diretamente)
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

// Exportar para uso global se necessário
window.ChordTransposer = {
  utils,
  navigation,
  transposition,
  simpleTransposer,
  partsTransposer,
  fullChordTransposer
};

