/**
 * Visualizador de Mídias do WhatsApp
 * 
 * Esta aplicação permite o upload de um arquivo .zip contendo mídias e mensagens do WhatsApp
 * e exibe essas mídias e textos em um formato visual semelhante ao de um chat do WhatsApp.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Elementos do DOM
  const fileInput = document.getElementById('fileInput');
  const uploadContainer = document.getElementById('uploadContainer');
  const chatContainer = document.getElementById('chatContainer');
  const loadingArea = document.getElementById('loadingArea');
  const uploadArea = document.querySelector('.upload-area');
  const noFilesMessage = document.getElementById('noFilesMessage');
  const retryButton = document.getElementById('retryButton');
  const selectButton = document.querySelector('.select-button');
  const contactList = document.getElementById('contactList');
  const currentChatName = document.getElementById('currentChatName');
  const addConversationBtn = document.getElementById('addConversationBtn');
  const sidebar = document.getElementById('sidebar');
  
  // Nome do banco de dados IndexedDB
  const DB_NAME = 'whatsappMediaDB';
  const DB_VERSION = 1;
  const MEDIA_STORE = 'mediaFiles';
  
  // Inicializa o banco de dados IndexedDB
  let db;
  
  // Função para abrir a conexão com o banco de dados
  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      
      request.onerror = (event) => {
        console.error("Erro ao abrir banco de dados:", event.target.error);
        reject(event.target.error);
      };
      
      request.onsuccess = (event) => {
        db = event.target.result;
        console.log("Banco de dados aberto com sucesso");
        resolve(db);
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        // Cria o object store para armazenar as mídias
        if (!db.objectStoreNames.contains(MEDIA_STORE)) {
          db.createObjectStore(MEDIA_STORE, { keyPath: 'id' });
          console.log("Object store criado");
        }
      };
    });
  }
  
  // Inicializa o banco de dados quando a página carrega
  openDatabase().catch(error => {
    console.error("Não foi possível abrir o banco de dados:", error);
    alert("Seu navegador pode não suportar armazenamento de mídia. As mídias não serão salvas permanentemente.");
  });
  
  // Elementos para exclusão de conversas
  const confirmDeleteModal = document.getElementById('confirmDelete');
  const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
  const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');

  // Extensões de mídia suportadas
  const supportedExtensions = {
    image: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
    video: ['.mp4', '.mov', '.avi', '.webm'],
    audio: ['.mp3', '.ogg', '.opus', '.m4a', '.wav']
  };

  // Armazenar dados das conversas
  let conversations = {};
  let currentConversation = null;
  let currentConversationName = '';
  let conversationToDelete = ''; // Para armazenar a conversa a ser excluída

  // Carregar conversas salvas
  loadConversationsFromLocalStorage();

  /**
   * Manipula o evento de clique no botão de seleção de arquivo
   */
  selectButton.addEventListener('click', () => {
    fileInput.click();
  });

  /**
   * Manipula o evento de clique no botão de adicionar nova conversa
   */
  addConversationBtn.addEventListener('click', () => {
    // Reinicia a aplicação para o estado inicial (tela de upload)
    resetApp();
    // Mostra a área de upload
    uploadContainer.style.display = 'flex';
  });

  /**
   * Manipula o evento de alteração do input de arquivo
   */
  fileInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file && file.name.endsWith('.zip')) {
      // Mostra área de carregamento
      uploadArea.style.display = 'none';
      loadingArea.style.display = 'flex';
      
      // Processa o arquivo .zip
      processZipFile(file);
    } else if (file) {
      alert('Por favor, selecione um arquivo .zip válido.');
    }
  });

  /**
   * Manipula o evento de clique no botão de tentar novamente
   */
  retryButton.addEventListener('click', () => {
    resetApp();
  });

  /**
   * Eventos para os botões de confirmação/cancelamento de exclusão
   */
  confirmDeleteBtn.addEventListener('click', () => {
    if (conversationToDelete) {
      deleteConversation(conversationToDelete);
      conversationToDelete = '';
    }
    confirmDeleteModal.style.display = 'none';
  });

  cancelDeleteBtn.addEventListener('click', () => {
    conversationToDelete = '';
    confirmDeleteModal.style.display = 'none';
  });

  /**
   * Processa o arquivo .zip selecionado pelo usuário
   * @param {File} file - Arquivo .zip a ser processado
   */
  async function processZipFile(file) {
    try {
      // Reinicializa os dados da conversa
      currentConversation = {
        messages: [],
        mediaFiles: {},
        timestamp: new Date().toISOString(),
        hasMedia: false
      };

      // Carrega o arquivo .zip usando JSZip
      const zip = new JSZip();
      const zipContent = await zip.loadAsync(file);
      
      // Processa o arquivo de texto primeiro
      const textFile = Object.values(zipContent.files).find(file => 
        file.name.toLowerCase().endsWith('.txt') && !file.dir
      );

      if (textFile) {
        const textContent = await textFile.async('string');
        processTextContent(textContent);
      }
      
      // Define o nome da conversa antes de processar as mídias
      if (!currentConversationName) {
        // Extrai o nome do arquivo como nome da conversa
        currentConversationName = file.name.replace('.zip', '');
      }
      
      // Processa os arquivos de mídia
      const mediaPromises = Object.keys(zipContent.files).map(async (filename) => {
        const zipEntry = zipContent.files[filename];
        
        if (zipEntry.dir) return;
        
        // Normaliza o nome do arquivo para facilitar correspondência posterior
        const normalizedFilename = filename.split('/').pop();
        
        const extension = '.' + normalizedFilename.split('.').pop().toLowerCase();
        const mediaType = getMediaType(extension);
        
        if (!mediaType) return;
        
        try {
          const content = await zipEntry.async('blob');
          
          // Armazena o arquivo com o nome normalizado para facilitar a busca
          currentConversation.mediaFiles[normalizedFilename] = {
            content,
            type: mediaType,
            url: URL.createObjectURL(content),
            extension,
            originalPath: filename
          };
          
          // Também armazena com o caminho completo para casos em que a referência seja o caminho completo
          if (filename !== normalizedFilename) {
            currentConversation.mediaFiles[filename] = currentConversation.mediaFiles[normalizedFilename];
          }
          
          // Define a flag de mídia como true quando encontra pelo menos um arquivo de mídia
          currentConversation.hasMedia = true;
          
          // Salva a mídia no IndexedDB
          try {
            await saveMediaToIndexedDB(currentConversationName, normalizedFilename, currentConversation.mediaFiles[normalizedFilename]);
            
            // Se também temos uma referência pelo caminho completo, salvamos essa referência também
            if (filename !== normalizedFilename) {
              await saveMediaToIndexedDB(currentConversationName, filename, currentConversation.mediaFiles[filename]);
            }
          } catch (dbError) {
            console.error(`Erro ao salvar mídia no IndexedDB: ${normalizedFilename}`, dbError);
            // Continua mesmo se houver erro ao salvar no IndexedDB
          }
        } catch (error) {
          console.error(`Erro ao processar arquivo de mídia ${filename}:`, error);
        }
      });
      
      try {
        await Promise.all(mediaPromises);
        
        // Analisa novamente as mensagens para tentar associar mídia
        reassociateMediaToMessages();
        
        // Renderiza a conversa
        displayConversation();
        
        // Salva a conversa
        saveCurrentConversation();
      } catch (error) {
        console.error("Erro ao processar arquivos de mídia:", error);
        alert('Ocorreu um erro ao processar os arquivos de mídia, mas o texto foi carregado.');
        displayConversation();
      }
      
    } catch (error) {
      console.error('Erro ao processar arquivo .zip:', error);
      alert('Ocorreu um erro ao processar o arquivo. Por favor, tente novamente.');
      resetApp();
    }

    // Depois que o arquivo ZIP é processado e as conversas são carregadas
    // Adicionar:
    setTimeout(() => {
      if (currentConversation) {
        const { hasMissingMedia } = checkForMissingMedia(currentConversation);
        // Não precisamos mostrar alerta aqui pois acabamos de importar o arquivo
        // Só definimos uma flag que indica que temos mídias
        currentConversation.hasMedia = hasMissingMedia || 
          (currentConversation.mediaFiles && Object.keys(currentConversation.mediaFiles).length > 0);
      }
    }, 500);
  }
  
  /**
   * Tenta reassociar arquivos de mídia às mensagens após o carregamento
   */
  function reassociateMediaToMessages() {
    // Lista de nomes de arquivo de mídia disponíveis
    const availableMedia = Object.keys(currentConversation.mediaFiles);
    
    // Se não há mídia, não precisa fazer nada
    if (availableMedia.length === 0) return;
    
    // Para cada mensagem
    currentConversation.messages.forEach(message => {
      // Só processa se ainda não tem mídia associada
      if (!message.mediaReference) {
        // Procura por padrões de referência de mídia no texto
        const reference = extractMediaReference(message.text);
        if (reference) {
          // Tenta encontrar o arquivo correspondente
          const found = findMediaFile(reference, currentConversation.mediaFiles);
          if (found) {
            message.mediaReference = found;
          }
        }
      }
    });
  }

  /**
   * Processa o conteúdo do arquivo de texto
   * @param {string} content - Conteúdo do arquivo de texto
   */
  function processTextContent(content) {
    const lines = content.split('\n');
    let currentMessage = null;
    let contactNames = new Set();

    const dateRegex = /^\[?(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?)\]?\s+-\s+([^:]+):\s+(.+)$/;

    lines.forEach(line => {
      const match = line.match(dateRegex);
      
      if (match) {
        if (currentMessage) {
          currentConversation.messages.push(currentMessage);
        }

        const [, date, time, sender, text] = match;
        currentMessage = {
          date,
          time,
          sender: sender.trim(),
          text,
          mediaReference: extractMediaReference(text)
        };
        
        // Adiciona o nome do contato à lista de contatos
        contactNames.add(sender.trim());
      } else if (currentMessage && line.trim()) {
        currentMessage.text += '\n' + line.trim();
      }
    });

    if (currentMessage) {
      currentConversation.messages.push(currentMessage);
    }

    // Ordena mensagens por data e hora
    currentConversation.messages.sort((a, b) => {
      const dateA = new Date(a.date.split('/').reverse().join('/') + ' ' + a.time);
      const dateB = new Date(b.date.split('/').reverse().join('/') + ' ' + b.time);
      return dateA - dateB;
    });

    // Define o nome da conversa com base no primeiro contato encontrado (se não for definido manualmente)
    if (contactNames.size > 0 && !currentConversationName) {
      currentConversationName = Array.from(contactNames)[0];
    }
  }

  /**
   * Extrai referência de mídia do texto da mensagem
   * @param {string} text - Texto da mensagem
   * @returns {string|null} - Nome do arquivo de mídia ou null
   */
  function extractMediaReference(text) {
    // Padrões do WhatsApp para nomes de arquivo
    const mediaPatterns = [
      /IMG-\d{8}-WA\d{4}\.\w{3,4}/i,  // Imagens (case insensitive)
      /VID-\d{8}-WA\d{4}\.\w{3,4}/i,  // Vídeos (case insensitive)
      /PTT-\d{8}-WA\d{4}\.\w{3,4}/i,  // Áudios (case insensitive)
      /\w+-\d{8}-WA\d{4}\.\w{3,4}/i,  // Outros formatos possíveis (case insensitive)
      /(arquivo anexado)/i,           // Texto indicando anexo em português
      /(attached file)/i              // Texto indicando anexo em inglês
    ];

    // Procura no texto completo
    for (const pattern of mediaPatterns) {
      const match = text.match(pattern);
      if (match) {
        return match[0].includes("anexado") || match[0].includes("attached") ? null : match[0];
      }
    }

    // Verifica se há um padrão de imagem ao final do texto (comum no WhatsApp)
    if (text.endsWith(".jpg") || text.endsWith(".jpeg") || text.endsWith(".png") || 
        text.endsWith(".gif") || text.endsWith(".mp4") || text.endsWith(".webp")) {
      // Extrai o nome do arquivo do texto
      const parts = text.split(/[\s\/\\]+/); // Divide por espaços ou barras
      const lastPart = parts[parts.length - 1]; // Pega a última parte
      
      // Verifica se parece um nome de arquivo
      if (lastPart.includes(".") && lastPart.length > 4) {
        return lastPart;
      }
    }

    return null;
  }

  /**
   * Verifica se o arquivo de mídia referenciado existe no objeto mediaFiles
   * e encontra um arquivo similar se o nome exato não for encontrado
   * @param {string} reference - Nome de arquivo de referência
   * @param {Object} mediaFiles - Objeto contendo os arquivos de mídia
   * @returns {string|null} - Nome do arquivo encontrado ou null
   */
  function findMediaFile(reference, mediaFiles) {
    // Verificação direta
    if (mediaFiles[reference]) {
      return reference;
    }
    
    // Se não encontrou diretamente, tenta fazer uma busca parcial
    // Isso ajuda quando há pequenas diferenças no nome (maiúsculas/minúsculas, etc)
    const refLower = reference.toLowerCase();
    for (const filename in mediaFiles) {
      if (filename.toLowerCase().includes(refLower) || 
          refLower.includes(filename.toLowerCase())) {
        return filename;
      }
    }
    
    // Se ainda não encontrou, tenta identificar por tipo/padrão
    // Ex: qualquer imagem IMG-XXXXXXXX-WAXXXX.jpg
    if (reference.match(/IMG-.*\.jpe?g/i)) {
      for (const filename in mediaFiles) {
        if (filename.match(/IMG-.*\.jpe?g/i)) {
          return filename;
        }
      }
    }
    
    return null;
  }

  /**
   * Determina o tipo de mídia com base na extensão do arquivo
   * @param {string} extension - Extensão do arquivo
   * @returns {string|null} - Tipo de mídia ou null se não for suportado
   */
  function getMediaType(extension) {
    if (supportedExtensions.image.includes(extension)) return 'image';
    if (supportedExtensions.video.includes(extension)) return 'video';
    if (supportedExtensions.audio.includes(extension)) return 'audio';
    return null;
  }

  /**
   * Verifica se há mídias ausentes na conversa
   * @param {Object} conversation - Objeto de conversa a ser verificado
   * @returns {Object} Objeto com flags e lista de mídias ausentes
   */
  function checkForMissingMedia(conversation) {
    const result = {
      hasMissingMedia: false,
      missingMediaCount: 0,
      missingMediaList: []
    };
    
    if (!conversation || !conversation.messages) {
      return result;
    }
    
    // Verifica todas as mensagens em busca de referências a mídias
    conversation.messages.forEach(message => {
      if (message.mediaFile) {
        // Verifica se a mídia está disponível
        if (!conversation.mediaFiles || !conversation.mediaFiles[message.mediaFile]) {
          result.hasMissingMedia = true;
          result.missingMediaCount++;
          if (!result.missingMediaList.includes(message.mediaFile)) {
            result.missingMediaList.push(message.mediaFile);
          }
        }
      }
    });
    
    return result;
  }

  /**
   * Exibe um alerta sobre mídias ausentes na conversa
   * @param {Object} missingMediaInfo - Informações sobre mídias ausentes
   */
  function showMissingMediaAlert(missingMediaInfo) {
    // Verifica se já existe um alerta e o remove
    const existingAlert = document.querySelector('.media-alert');
    if (existingAlert) {
      existingAlert.remove();
    }
    
    // Se não há mídias ausentes, não exibe o alerta
    if (!missingMediaInfo.hasMissingMedia) {
      return;
    }
    
    // Cria o elemento de alerta
    const alertDiv = document.createElement('div');
    alertDiv.className = 'media-alert';
    
    // Texto do alerta
    alertDiv.innerHTML = `
      <p><strong>Atenção:</strong> ${missingMediaInfo.missingMediaCount} arquivo(s) de mídia não está(ão) disponível(is).</p>
      <p>As mídias não são salvas permanentemente e precisam ser recarregadas do arquivo ZIP original.</p>
      <button class="reload-media-btn">Recarregar Arquivo ZIP</button>
    `;
    
    // Adiciona evento ao botão
    const reloadButton = alertDiv.querySelector('.reload-media-btn');
    reloadButton.addEventListener('click', () => {
      document.getElementById('fileInput').click();
    });
    
    // Adiciona o alerta ao chat
    const chatContainer = document.getElementById('chatContainer');
    chatContainer.insertBefore(alertDiv, chatContainer.firstChild);
  }

  /**
   * Exibe a conversa na interface
   */
  function displayConversation() {
    // Esconde a área de upload e mostra o container de chat
    uploadContainer.style.display = 'none';
    loadingArea.style.display = 'none';
    chatContainer.style.display = 'block';
    
    // Atualiza o título do chat
    currentChatName.textContent = currentConversationName;
    
    const chatBackground = document.querySelector('.chat-background');
    chatBackground.innerHTML = '';
    
    // Configura o layout para alinhar as mensagens corretamente
    chatBackground.style.display = 'flex';
    chatBackground.style.flexDirection = 'column';
    
    // Verificar se existem mídias ausentes
    const missingMediaInfo = checkForMissingMedia(currentConversation);
    
    // Se há mídias ausentes ou se a conversa tinha mídia originalmente (hasMedia) mas agora não tem nenhuma
    // (porque a página foi recarregada e o blob foi perdido), mostrar alerta para recarregar
    if (missingMediaInfo.hasMissingMedia || 
        (currentConversation.hasMedia && 
         (!currentConversation.mediaFiles || Object.keys(currentConversation.mediaFiles).length === 0))) {
      showMissingMediaAlert(missingMediaInfo.hasMissingMedia ? missingMediaInfo : {
        hasMissingMedia: true,
        missingMediaCount: currentConversation.messages.filter(m => m.mediaReference || m.mediaFile).length,
        missingMediaList: []
      });
    }
    
    // Cria um fragmento para melhorar a performance
    const fragment = document.createDocumentFragment();
    
    // Adiciona todas as mensagens de uma vez, sem setTimeout
    currentConversation.messages.forEach(message => {
      const messageBubble = createMessageBubble(message, currentConversation);
      fragment.appendChild(messageBubble);
    });
    
    // Adiciona todas as mensagens ao chat de uma vez
    chatBackground.appendChild(fragment);
    
    // Rola diretamente para a última mensagem
    chatBackground.scrollTop = chatBackground.scrollHeight;

    // Atualiza a lista de conversas na barra lateral
    updateConversationsList();
  }

  /**
   * Cria um elemento de bolha de mensagem
   * @param {Object} message - Objeto contendo dados da mensagem
   * @param {Object} currentConversation - Conversa atual
   * @returns {HTMLElement} - Elemento DOM da bolha de mensagem
   */
  function createMessageBubble(message, currentConversation) {
    const messageBubble = document.createElement('div');
    
    // Identifica se a mensagem foi enviada pelo usuário baseado no nome do remetente
    const isUserMessage = message.sender.includes('Samuel') || message.sender.includes('Você');
    
    // Aplica classes diferentes para mensagens enviadas e recebidas
    messageBubble.className = `message-bubble ${isUserMessage ? 'sent' : 'received'}`;

    // Para mensagens recebidas, mostra o nome do remetente
    if (!isUserMessage) {
      const senderName = document.createElement('div');
      senderName.className = 'sender-name';
      senderName.textContent = message.sender;
      messageBubble.appendChild(senderName);
    }

    // Tenta identificar mídia no texto da mensagem se não foi identificada antes
    let mediaFile = message.mediaFile || message.mediaReference || extractMediaReference(message.text);
    
    // Se houver mídia referenciada e ela existir nos arquivos
    if (mediaFile && currentConversation.mediaFiles && currentConversation.mediaFiles[mediaFile]) {
      const mediaData = currentConversation.mediaFiles[mediaFile];
      const mediaContainer = document.createElement('div');
      mediaContainer.className = 'media-container';

      let mediaElement;
      switch (mediaData.type) {
        case 'image':
          mediaElement = document.createElement('img');
          mediaElement.src = mediaData.url;
          mediaElement.alt = 'Imagem do WhatsApp';
          mediaElement.loading = 'lazy';
          
          // Adicionar evento de clique para expandir a imagem
          mediaElement.onclick = function() {
            const expandedView = document.createElement('div');
            expandedView.className = 'expanded-media';
            expandedView.onclick = function() {
              document.body.removeChild(expandedView);
            };
            
            const expandedImg = document.createElement('img');
            expandedImg.src = mediaData.url;
            expandedImg.alt = 'Imagem expandida';
            
            expandedView.appendChild(expandedImg);
            document.body.appendChild(expandedView);
          };
          break;
          
        case 'video':
          mediaElement = document.createElement('video');
          mediaElement.src = mediaData.url;
          mediaElement.controls = true;
          break;
          
        case 'audio':
          mediaElement = document.createElement('audio');
          mediaElement.src = mediaData.url;
          mediaElement.controls = true;
          break;
      }

      mediaContainer.appendChild(mediaElement);
      messageBubble.appendChild(mediaContainer);
      
      // Adiciona o texto, se houver algo além da referência à mídia
      if (message.text && !message.text.trim().endsWith(mediaFile)) {
        const textContainer = document.createElement('div');
        textContainer.className = 'text-container';
        textContainer.textContent = message.text;
        messageBubble.appendChild(textContainer);
      }
    } else if (mediaFile) {
      // Caso onde há referência de mídia, mas a mídia não está disponível
      const mediaPlaceholder = document.createElement('div');
      mediaPlaceholder.className = 'media-placeholder';
      
      const placeholderIcon = document.createElement('i');
      
      // Determina o tipo de ícone com base na extensão do arquivo
      if (mediaFile.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
        placeholderIcon.className = 'fas fa-image';
      } else if (mediaFile.match(/\.(mp4|avi|mov|webm)$/i)) {
        placeholderIcon.className = 'fas fa-video';
      } else if (mediaFile.match(/\.(mp3|wav|ogg|m4a)$/i)) {
        placeholderIcon.className = 'fas fa-music';
      } else {
        placeholderIcon.className = 'fas fa-file';
      }
      
      const placeholderText = document.createElement('div');
      placeholderText.className = 'placeholder-text';
      placeholderText.textContent = `Mídia não disponível: ${mediaFile}`;
      
      mediaPlaceholder.appendChild(placeholderIcon);
      mediaPlaceholder.appendChild(placeholderText);
      messageBubble.appendChild(mediaPlaceholder);
      
      // Adiciona o texto da mensagem, sem a referência da mídia
      const messageTextWithoutMedia = message.text.replace(mediaFile, '').trim();
      if (messageTextWithoutMedia) {
        const textContainer = document.createElement('div');
        textContainer.className = 'text-container';
        textContainer.textContent = messageTextWithoutMedia;
        messageBubble.appendChild(textContainer);
      }
    } else {
      // Sem mídia, apenas texto
      const textContainer = document.createElement('div');
      textContainer.className = 'text-container';
      textContainer.textContent = message.text;
      messageBubble.appendChild(textContainer);
    }

    // Adiciona o horário
    const messageTime = document.createElement('div');
    messageTime.className = 'message-time';
    messageTime.textContent = message.time;
    messageBubble.appendChild(messageTime);

    return messageBubble;
  }

  /**
   * Atualiza a lista de conversas na barra lateral
   */
  function updateConversationsList() {
    contactList.innerHTML = '';
    
    // Se não há conversas, mostrar mensagem
    if (Object.keys(conversations).length === 0) {
      const emptyContacts = document.createElement('div');
      emptyContacts.className = 'empty-contacts';
      emptyContacts.innerHTML = '<p>Nenhuma conversa encontrada</p>';
      contactList.appendChild(emptyContacts);
      return;
    }
    
    // Adiciona cada conversa à lista
    Object.keys(conversations).forEach(conversationName => {
      const conversation = conversations[conversationName];
      const contactItem = document.createElement('div');
      contactItem.className = 'contact-item';
      
      // Marca a conversa ativa
      if (conversationName === currentConversationName) {
        contactItem.classList.add('active');
      }
      
      // Avatar do contato
      const contactAvatar = document.createElement('div');
      contactAvatar.className = 'contact-avatar';
      contactAvatar.innerHTML = '<i class="fas fa-user"></i>';
      
      // Informações do contato
      const contactInfo = document.createElement('div');
      contactInfo.className = 'contact-info';
      
      const contactNameElement = document.createElement('div');
      contactNameElement.className = 'contact-name';
      contactNameElement.textContent = conversationName;
      
      const contactPreview = document.createElement('div');
      contactPreview.className = 'contact-preview';
      
      // Obtém data da última atualização
      const date = new Date(conversation.timestamp);
      const formattedDate = `${date.toLocaleDateString()} ${date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
      contactPreview.textContent = `Atualizado em: ${formattedDate}`;
      
      // Botão para excluir a conversa
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'delete-conversation-btn';
      deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
      deleteBtn.title = 'Excluir conversa';
      
      // Adiciona evento de clique para o botão de exclusão
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Evita que o clique propague para o item da conversa
        conversationToDelete = conversationName;
        confirmDeleteModal.style.display = 'flex';
      });
      
      // Monta a estrutura do item de contato
      contactInfo.appendChild(contactNameElement);
      contactInfo.appendChild(contactPreview);
      
      contactItem.appendChild(contactAvatar);
      contactItem.appendChild(contactInfo);
      contactItem.appendChild(deleteBtn);
      
      // Adiciona evento de clique para carregar a conversa
      contactItem.addEventListener('click', () => {
        loadConversation(conversationName);
      });
      
      contactList.appendChild(contactItem);
    });
  }

  /**
   * Exclui uma conversa
   * @param {string} conversationName - Nome da conversa a ser excluída
   */
  function deleteConversation(conversationName) {
    // Libera URLs de objetos para evitar vazamento de memória
    if (conversations[conversationName] && conversations[conversationName].mediaFiles) {
      const mediaFiles = conversations[conversationName].mediaFiles;
      Object.keys(mediaFiles).forEach(filename => {
        if (mediaFiles[filename].url) {
          URL.revokeObjectURL(mediaFiles[filename].url);
        }
      });
    }
    
    // Remove a conversa do objeto de conversas
    delete conversations[conversationName];
    
    // Salva as alterações no localStorage
    saveConversationsToLocalStorage();
    
    // Exclui todas as mídias do IndexedDB
    deleteAllMediaForConversation(conversationName)
      .then(() => {
        console.log(`Todas as mídias da conversa ${conversationName} foram removidas do IndexedDB`);
      })
      .catch(error => {
        console.error(`Erro ao excluir mídias do IndexedDB para a conversa ${conversationName}:`, error);
      });
    
    // Se a conversa atual foi excluída, volta para a tela inicial
    if (currentConversationName === conversationName) {
      resetApp();
    } else {
      // Atualiza a lista de conversas
      updateConversationsList();
    }
  }

  /**
   * Carrega uma conversa pelo nome
   * @param {string} conversationName - Nome da conversa a ser carregada
   */
  function loadConversation(conversationName) {
    if (conversations[conversationName]) {
      // Mostra um indicador de loading
      loadingArea.style.display = 'flex';
      
      currentConversation = conversations[conversationName];
      currentConversationName = conversationName;
      
      // Atualiza a última data de acesso
      currentConversation.lastAccessed = new Date().toISOString();
      
      // Se a conversa não tem mediaFiles ou está vazia, tenta carregar do IndexedDB
      if (!currentConversation.mediaFiles || Object.keys(currentConversation.mediaFiles).length === 0) {
        // Usamos Promise para lidar com operações assíncronas
        loadAllMediaForConversation(conversationName)
          .then(mediaFiles => {
            if (Object.keys(mediaFiles).length > 0) {
              currentConversation.mediaFiles = mediaFiles;
              console.log(`${Object.keys(mediaFiles).length} mídias carregadas do IndexedDB para a conversa ${conversationName}`);
              
              // Atualiza a exibição com as mídias carregadas
              displayConversation();
            } else {
              console.log(`Nenhuma mídia encontrada no IndexedDB para a conversa ${conversationName}`);
              currentConversation.mediaFiles = {};
              
              // Exibe a conversa mesmo sem mídias
              completeConversationLoading();
            }
          })
          .catch(error => {
            console.error(`Erro ao carregar mídias do IndexedDB para a conversa ${conversationName}:`, error);
            currentConversation.mediaFiles = {};
            
            // Exibe a conversa mesmo com erro
            completeConversationLoading();
          });
      } else {
        // Já temos as mídias em memória, exibe a conversa
        completeConversationLoading();
      }
    }
  }
  
  /**
   * Completa o carregamento da conversa e exibe na interface
   */
  function completeConversationLoading() {
    saveConversationsToLocalStorage();
    
    // Atualiza a lista de conversas
    updateConversationsList();
    
    // Exibe a conversa
    displayConversation();
    
    // Verifica se a conversa tinha mídias mas elas estão ausentes agora
    if (currentConversation.hasMedia && 
        (!currentConversation.mediaFiles || Object.keys(currentConversation.mediaFiles).length === 0)) {
      // Cria objeto de informações de mídia ausente para mostrar o alerta
      const missingMediaInfo = {
        hasMissingMedia: true,
        missingMediaCount: currentConversation.messages.filter(m => m.mediaReference || m.mediaFile).length,
        missingMediaList: []
      };
      
      // Mostra o alerta de mídia ausente
      showMissingMediaAlert(missingMediaInfo);
    }
    
    // Esconde o indicador de loading
    loadingArea.style.display = 'none';
  }

  /**
   * Salva a conversa atual 
   */
  function saveCurrentConversation() {
    if (currentConversation && currentConversationName) {
      // Certifica-se de que a flag hasMedia é corretamente definida antes de salvar
      if (currentConversation.mediaFiles && Object.keys(currentConversation.mediaFiles).length > 0) {
        currentConversation.hasMedia = true;
      }
      
      conversations[currentConversationName] = {...currentConversation};
      saveConversationsToLocalStorage();
    }
  }

  /**
   * Salva todas as conversas no localStorage
   */
  function saveConversationsToLocalStorage() {
    try {
      // Prepara os dados para salvar (sem os blobs das mídias)
      const conversationsToSave = {};
      
      Object.keys(conversations).forEach(conversationName => {
        const conversation = conversations[conversationName];
        
        // Cria uma cópia sem os blobs para salvar no localStorage
        conversationsToSave[conversationName] = {
          messages: conversation.messages,
          timestamp: conversation.timestamp,
          hasMedia: conversation.hasMedia || (conversation.mediaFiles && Object.keys(conversation.mediaFiles).length > 0)
        };
      });
      
      localStorage.setItem('whatsappConversations', JSON.stringify(conversationsToSave));
    } catch (error) {
      console.error('Erro ao salvar conversas no localStorage:', error);
    }
  }

  /**
   * Carrega as conversas do localStorage
   */
  function loadConversationsFromLocalStorage() {
    try {
      const savedConversations = localStorage.getItem('whatsappConversations');
      
      if (savedConversations) {
        conversations = JSON.parse(savedConversations);
        
        // Inicializa os mediaFiles vazios para cada conversa carregada
        Object.keys(conversations).forEach(conversationName => {
          if (!conversations[conversationName].mediaFiles) {
            conversations[conversationName].mediaFiles = {};
          }
        });
        
        // Atualiza a lista de conversas
        updateConversationsList();
      }
    } catch (error) {
      console.error('Erro ao carregar conversas do localStorage:', error);
      conversations = {};
    }
  }

  /**
   * Reinicia a aplicação para o estado inicial
   */
  function resetApp() {
    fileInput.value = '';
    uploadArea.style.display = 'block';
    loadingArea.style.display = 'none';
    chatContainer.style.display = 'none';
    noFilesMessage.style.display = 'none';
    
    const chatBackground = document.querySelector('.chat-background');
    chatBackground.innerHTML = '';
    
    currentConversation = null;
    currentConversationName = '';
    currentChatName.textContent = 'Visualizador de Mídias';
  }

  /**
   * Adiciona suporte para arrastar e soltar arquivos
   */
  const dropArea = document.querySelector('.upload-area');
  
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropArea.addEventListener(eventName, preventDefaults, false);
  });
  
  function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }
  
  ['dragenter', 'dragover'].forEach(eventName => {
    dropArea.addEventListener(eventName, highlight, false);
  });
  
  ['dragleave', 'drop'].forEach(eventName => {
    dropArea.addEventListener(eventName, unhighlight, false);
  });
  
  function highlight() {
    dropArea.classList.add('highlight');
  }
  
  function unhighlight() {
    dropArea.classList.remove('highlight');
  }
  
  dropArea.addEventListener('drop', handleDrop, false);
  
  function handleDrop(e) {
    const dt = e.dataTransfer;
    const file = dt.files[0];
    
    if (file && file.name.endsWith('.zip')) {
      fileInput.files = dt.files;
      uploadArea.style.display = 'none';
      loadingArea.style.display = 'flex';
      processZipFile(file);
    } else if (file) {
      alert('Por favor, solte apenas arquivos .zip válidos.');
    }
  }

  // Adiciona suporte para dispositivos móveis
  if (window.innerWidth <= 768) {
    // Cria o botão para exibir/ocultar a sidebar
    const toggleButton = document.createElement('div');
    toggleButton.className = 'sidebar-toggle';
    toggleButton.innerHTML = '<i class="fas fa-bars"></i>';
    document.querySelector('.app-container').appendChild(toggleButton);
    
    // Adiciona evento para exibir/ocultar a sidebar
    toggleButton.addEventListener('click', () => {
      sidebar.classList.toggle('active');
    });
    
    // Fecha a sidebar ao clicar em um contato em telas pequenas
    document.querySelectorAll('.contact-item').forEach(item => {
      item.addEventListener('click', () => {
        sidebar.classList.remove('active');
      });
    });
  }

  const style = document.createElement('style');
  style.textContent = `
    /* Estilos para alerta de mídia ausente */
    .media-alert {
      background-color: #FFF3CD;
      border: 1px solid #FFEEBA;
      border-radius: 8px;
      padding: 10px 15px;
      margin: 10px;
      color: #856404;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
    }

    .reload-media-btn {
      background-color: #28a745;
      color: white;
      border: none;
      border-radius: 4px;
      padding: 8px 12px;
      margin-top: 10px;
      cursor: pointer;
      font-weight: bold;
    }

    .reload-media-btn:hover {
      background-color: #218838;
    }

    /* Estilos para placeholder de mídia */
    .media-placeholder {
      background-color: #f8f9fa;
      border: 1px dashed #ccc;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 5px;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
    }

    .media-placeholder i {
      font-size: 2rem;
      color: #6c757d;
      margin-bottom: 10px;
    }

    .placeholder-text {
      color: #6c757d;
      font-size: 0.9rem;
    }
  `;
  document.head.appendChild(style);

  /**
   * Salva um arquivo de mídia no banco de dados IndexedDB
   * @param {string} conversationName - Nome da conversa
   * @param {string} fileName - Nome do arquivo
   * @param {Object} mediaData - Dados da mídia a ser salva
   * @returns {Promise} - Promise resolvida quando o arquivo é salvo
   */
  function saveMediaToIndexedDB(conversationName, fileName, mediaData) {
    return new Promise((resolve, reject) => {
      if (!db) {
        reject(new Error("Banco de dados não inicializado"));
        return;
      }
      
      try {
        // Cria um objeto com os dados da mídia para salvar
        const mediaObject = {
          id: `${conversationName}_${fileName}`,
          conversationName,
          fileName,
          content: mediaData.content,
          type: mediaData.type,
          extension: mediaData.extension,
          originalPath: mediaData.originalPath,
          timestamp: new Date().getTime()
        };
        
        const transaction = db.transaction([MEDIA_STORE], 'readwrite');
        const store = transaction.objectStore(MEDIA_STORE);
        
        const request = store.put(mediaObject);
        
        request.onsuccess = () => {
          console.log(`Mídia salva com sucesso: ${fileName}`);
          resolve();
        };
        
        request.onerror = (event) => {
          console.error(`Erro ao salvar mídia ${fileName}:`, event.target.error);
          reject(event.target.error);
        };
      } catch (error) {
        console.error(`Erro ao salvar mídia ${fileName}:`, error);
        reject(error);
      }
    });
  }
  
  /**
   * Carrega um arquivo de mídia do banco de dados IndexedDB
   * @param {string} conversationName - Nome da conversa
   * @param {string} fileName - Nome do arquivo
   * @returns {Promise} - Promise resolvida com os dados da mídia
   */
  function loadMediaFromIndexedDB(conversationName, fileName) {
    return new Promise((resolve, reject) => {
      if (!db) {
        reject(new Error("Banco de dados não inicializado"));
        return;
      }
      
      const transaction = db.transaction([MEDIA_STORE], 'readonly');
      const store = transaction.objectStore(MEDIA_STORE);
      
      const request = store.get(`${conversationName}_${fileName}`);
      
      request.onsuccess = (event) => {
        const mediaData = event.target.result;
        if (mediaData) {
          // Cria um novo URL para o blob
          mediaData.url = URL.createObjectURL(mediaData.content);
          resolve(mediaData);
        } else {
          resolve(null);
        }
      };
      
      request.onerror = (event) => {
        console.error(`Erro ao carregar mídia ${fileName}:`, event.target.error);
        reject(event.target.error);
      };
    });
  }
  
  /**
   * Carrega todas as mídias de uma conversa do banco de dados IndexedDB
   * @param {string} conversationName - Nome da conversa
   * @returns {Promise} - Promise resolvida com um objeto contendo todas as mídias
   */
  function loadAllMediaForConversation(conversationName) {
    return new Promise((resolve, reject) => {
      if (!db) {
        reject(new Error("Banco de dados não inicializado"));
        return;
      }
      
      const transaction = db.transaction([MEDIA_STORE], 'readonly');
      const store = transaction.objectStore(MEDIA_STORE);
      const mediaFiles = {};
      
      // Como não podemos fazer uma consulta direta por prefixo no IndexedDB, 
      // precisamos iterar sobre todos os registros
      const request = store.openCursor();
      
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          const item = cursor.value;
          if (item.conversationName === conversationName) {
            // Cria um novo URL para o blob
            item.url = URL.createObjectURL(item.content);
            mediaFiles[item.fileName] = item;
          }
          cursor.continue();
        } else {
          // Fim da iteração
          resolve(mediaFiles);
        }
      };
      
      request.onerror = (event) => {
        console.error(`Erro ao carregar mídias para a conversa ${conversationName}:`, event.target.error);
        reject(event.target.error);
      };
    });
  }
  
  /**
   * Remove todas as mídias de uma conversa do banco de dados IndexedDB
   * @param {string} conversationName - Nome da conversa
   * @returns {Promise} - Promise resolvida quando todas as mídias são removidas
   */
  function deleteAllMediaForConversation(conversationName) {
    return new Promise((resolve, reject) => {
      if (!db) {
        reject(new Error("Banco de dados não inicializado"));
        return;
      }
      
      const transaction = db.transaction([MEDIA_STORE], 'readwrite');
      const store = transaction.objectStore(MEDIA_STORE);
      
      // Como não podemos fazer uma exclusão direta por prefixo no IndexedDB,
      // primeiro listamos todos os registros que queremos excluir
      const keysToDelete = [];
      
      const cursorRequest = store.openCursor();
      
      cursorRequest.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          const item = cursor.value;
          if (item.conversationName === conversationName) {
            keysToDelete.push(item.id);
          }
          cursor.continue();
        } else {
          // Exclui todos os registros encontrados
          const deletePromises = keysToDelete.map(key => {
            return new Promise((resolveDelete, rejectDelete) => {
              const deleteRequest = store.delete(key);
              deleteRequest.onsuccess = resolveDelete;
              deleteRequest.onerror = rejectDelete;
            });
          });
          
          Promise.all(deletePromises)
            .then(() => {
              console.log(`Todas as mídias da conversa ${conversationName} foram removidas`);
              resolve();
            })
            .catch(error => {
              console.error(`Erro ao remover mídias da conversa ${conversationName}:`, error);
              reject(error);
            });
        }
      };
      
      cursorRequest.onerror = (event) => {
        console.error(`Erro ao listar mídias para exclusão da conversa ${conversationName}:`, event.target.error);
        reject(event.target.error);
      };
    });
  }
});