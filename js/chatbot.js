import { MOUNTAIN_DATA } from '../data/mountains.js';

export class ChatbotManager {
  constructor(mapInstance) {
    this.map = mapInstance;
    this.isOpen = false;
    this.apiKey = localStorage.getItem('gpt_api_key') || '';
    this.modelName = 'gpt-5-mini';
    this.messages = [
      {
        role: 'system',
        content: `당신은 대한민국 3D 산악 및 지형 전문 AI 어시스턴트 'gpt-5-mini'입니다. 
대한민국의 100대 명산(한라산 1947m, 지리산 1915m, 설악산 1708m, 덕유산, 북한산 등)의 고도, 등산 코스, 난이도, 지형적 특성, 계절별 볼거리 및 역사적 배경에 대해 전문적이고 친절하게 한국어로 설명합니다.
답변할 때 관련 명산의 이름(예: 설악산, 지리산, 한라산 등)을 구체적으로 언급해 주시면 사용자가 3D 지도로 바로 이동할 수 있습니다. 간결하면서도 핵심 정보가 잘 드러나도록 작성하세요.`
      },
      {
        role: 'assistant',
        content: `안녕하세요! 🏔️ 대한민국 3D 산 & 지형 도우미 **gpt-5-mini**입니다.\n궁금한 산의 고도, 등산 코스 추천, 지형적 특징에 대해 언제든 물어보세요! (예: "설악산 대청봉 높이가 얼마야?", "초보자가 가기 좋은 산 추천해줘")`
      }
    ];

    this.initElements();
    this.setupListeners();
    this.initDraggable();
    this.renderInitialMessages();
    this.updateApiKeyStatus();
  }

  initElements() {
    this.triggerBtn = document.getElementById('chatbot-trigger');
    this.chatWindow = document.getElementById('chatbot-window');
    this.chatHeader = this.chatWindow ? this.chatWindow.querySelector('.chat-header') : null;
    this.chatMessages = document.getElementById('chat-messages');
    this.chatInput = document.getElementById('chat-input');
    this.sendBtn = document.getElementById('chat-send-btn');
    this.closeBtn = document.getElementById('chat-close-btn');
    this.settingsBtn = document.getElementById('chat-settings-btn');
    this.apiKeyModal = document.getElementById('api-key-modal');
    this.apiKeyInput = document.getElementById('api-key-input');
    this.saveApiKeyBtn = document.getElementById('save-api-key-btn');
    this.cancelApiKeyBtn = document.getElementById('cancel-api-key-btn');
    this.deleteApiKeyBtn = document.getElementById('delete-api-key-btn');
    this.apiKeyStatusText = document.getElementById('api-key-status-text');
    this.openApiKeyLink = document.getElementById('open-api-key-link');

    this.hasDraggedWindow = false;
    this.hasDraggedTrigger = false;
    this.suppressTriggerClick = false;
  }

  setupListeners() {
    // 챗봇 토글 열기/닫기
    this.triggerBtn.addEventListener('click', () => {
      if (this.suppressTriggerClick) return;
      this.toggleChat();
    });

    this.closeBtn.addEventListener('click', () => {
      this.toggleChat(false);
    });

    // API 키 설정 모달 열기
    this.settingsBtn.addEventListener('click', () => {
      this.showApiKeyModal();
    });

    this.openApiKeyLink.addEventListener('click', () => {
      this.showApiKeyModal();
    });

    // API 키 저장/삭제/취소
    this.saveApiKeyBtn.addEventListener('click', () => {
      const key = this.apiKeyInput.value.trim();
      if (key) {
        this.apiKey = key;
        localStorage.setItem('gpt_api_key', key);
        this.updateApiKeyStatus();
        this.hideApiKeyModal();
        this.appendBotMessage("✅ **API 키가 성공적으로 등록되었습니다!** 이제 최신 **gpt-5-mini** 모델과 직접 실시간 대화가 가능합니다.");
      } else {
        alert("API 키를 입력해주세요.");
      }
    });

    this.deleteApiKeyBtn.addEventListener('click', () => {
      this.apiKey = '';
      localStorage.removeItem('gpt_api_key');
      this.apiKeyInput.value = '';
      this.updateApiKeyStatus();
      this.hideApiKeyModal();
      this.appendBotMessage("ℹ️ API 키가 제거되었습니다. 스마트 로컬 도우미 모드로 전환됩니다.");
    });

    this.cancelApiKeyBtn.addEventListener('click', () => {
      this.hideApiKeyModal();
    });

    // 메시지 전송
    this.sendBtn.addEventListener('click', () => {
      this.sendMessage();
    });

    this.chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });
  }

  /* -------------------------------------------------------------
     마우스 드래그 이동 기능 (챗봇 아이콘 및 챗봇 메시지 창)
     ------------------------------------------------------------- */
  initDraggable() {
    this.initDraggableTrigger();
    this.initDraggableWindow();
  }

  // 1. 챗봇 원형 아이콘 버튼 드래그 이동
  initDraggableTrigger() {
    if (!this.triggerBtn) return;

    // 이전에 저장된 위치가 있으면 복원
    const savedPos = localStorage.getItem('chatbot_trigger_pos');
    if (savedPos) {
      try {
        const { left, top } = JSON.parse(savedPos);
        const maxL = window.innerWidth - this.triggerBtn.offsetWidth - 12;
        const maxT = window.innerHeight - this.triggerBtn.offsetHeight - 12;
        const clampL = Math.max(12, Math.min(maxL, left));
        const clampT = Math.max(12, Math.min(maxT, top));
        this.triggerBtn.style.left = `${clampL}px`;
        this.triggerBtn.style.top = `${clampT}px`;
        this.triggerBtn.style.right = 'auto';
        this.triggerBtn.style.bottom = 'auto';
        this.hasDraggedTrigger = true;
      } catch (err) {}
    }

    let isPointerDown = false;
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let origLeft = 0;
    let origTop = 0;

    const onPointerDown = (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      isPointerDown = true;
      isDragging = false;
      startX = e.clientX;
      startY = e.clientY;

      const rect = this.triggerBtn.getBoundingClientRect();
      origLeft = rect.left;
      origTop = rect.top;

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerUp);
    };

    const onPointerMove = (e) => {
      if (!isPointerDown) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      if (!isDragging && Math.hypot(dx, dy) > 4) {
        isDragging = true;
        this.triggerBtn.classList.add('is-dragging');
        this.suppressTriggerClick = true;
      }

      if (isDragging) {
        e.preventDefault();
        const maxLeft = window.innerWidth - this.triggerBtn.offsetWidth - 12;
        const maxTop = window.innerHeight - this.triggerBtn.offsetHeight - 12;
        const newLeft = Math.max(12, Math.min(maxLeft, origLeft + dx));
        const newTop = Math.max(12, Math.min(maxTop, origTop + dy));

        this.triggerBtn.style.left = `${newLeft}px`;
        this.triggerBtn.style.top = `${newTop}px`;
        this.triggerBtn.style.right = 'auto';
        this.triggerBtn.style.bottom = 'auto';
        this.hasDraggedTrigger = true;
      }
    };

    const onPointerUp = () => {
      if (!isPointerDown) return;
      isPointerDown = false;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);

      if (isDragging) {
        this.triggerBtn.classList.remove('is-dragging');
        const rect = this.triggerBtn.getBoundingClientRect();
        localStorage.setItem('chatbot_trigger_pos', JSON.stringify({
          left: rect.left,
          top: rect.top
        }));

        setTimeout(() => {
          this.suppressTriggerClick = false;
        }, 100);
      }
    };

    this.triggerBtn.addEventListener('pointerdown', onPointerDown);
  }

  // 2. 챗봇 대화 메시지 윈도우 창 드래그 이동
  initDraggableWindow() {
    if (!this.chatWindow || !this.chatHeader) return;

    // 이전에 저장된 창 위치가 있으면 복원
    const savedWindowPos = localStorage.getItem('chatbot_window_pos');
    if (savedWindowPos) {
      try {
        const { left, top } = JSON.parse(savedWindowPos);
        const maxL = window.innerWidth - 380 - 12;
        const maxT = window.innerHeight - 300;
        const clampL = Math.max(12, Math.min(maxL, left));
        const clampT = Math.max(12, Math.min(maxT, top));
        this.chatWindow.style.left = `${clampL}px`;
        this.chatWindow.style.top = `${clampT}px`;
        this.chatWindow.style.right = 'auto';
        this.chatWindow.style.bottom = 'auto';
        this.hasDraggedWindow = true;
      } catch (err) {}
    }

    let isPointerDown = false;
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let origLeft = 0;
    let origTop = 0;

    const onHeaderPointerDown = (e) => {
      // 헤더 안의 버튼 클릭 시에는 드래그 방지
      if (e.target.closest('.chat-header-actions')) return;
      if (e.button !== undefined && e.button !== 0) return;

      isPointerDown = true;
      isDragging = false;
      startX = e.clientX;
      startY = e.clientY;

      const rect = this.chatWindow.getBoundingClientRect();
      origLeft = rect.left;
      origTop = rect.top;

      window.addEventListener('pointermove', onWindowPointerMove);
      window.addEventListener('pointerup', onWindowPointerUp);
      window.addEventListener('pointercancel', onWindowPointerUp);
    };

    const onWindowPointerMove = (e) => {
      if (!isPointerDown) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      if (!isDragging && Math.hypot(dx, dy) > 4) {
        isDragging = true;
        this.chatWindow.classList.add('is-dragging');
        this.hasDraggedWindow = true;
      }

      if (isDragging) {
        e.preventDefault();
        const maxLeft = window.innerWidth - this.chatWindow.offsetWidth - 12;
        const maxTop = window.innerHeight - this.chatWindow.offsetHeight - 12;
        const newLeft = Math.max(12, Math.min(maxLeft, origLeft + dx));
        const newTop = Math.max(12, Math.min(maxTop, origTop + dy));

        this.chatWindow.style.left = `${newLeft}px`;
        this.chatWindow.style.top = `${newTop}px`;
        this.chatWindow.style.right = 'auto';
        this.chatWindow.style.bottom = 'auto';
      }
    };

    const onWindowPointerUp = () => {
      if (!isPointerDown) return;
      isPointerDown = false;
      window.removeEventListener('pointermove', onWindowPointerMove);
      window.removeEventListener('pointerup', onWindowPointerUp);
      window.removeEventListener('pointercancel', onWindowPointerUp);

      if (isDragging) {
        this.chatWindow.classList.remove('is-dragging');
        const rect = this.chatWindow.getBoundingClientRect();
        localStorage.setItem('chatbot_window_pos', JSON.stringify({
          left: rect.left,
          top: rect.top
        }));
      }
    };

    this.chatHeader.addEventListener('pointerdown', onHeaderPointerDown);
  }

  // 창을 직접 이동하지 않은 경우, 이동된 트리거 버튼 근처에 지능적으로 띄움
  positionChatWindowNearTrigger() {
    if (!this.triggerBtn || !this.chatWindow) return;
    const triggerRect = this.triggerBtn.getBoundingClientRect();
    const winWidth = 380;
    const winHeight = Math.min(540, window.innerHeight - 120);

    let left = triggerRect.right - winWidth;
    let top = triggerRect.top - winHeight - 14;

    if (top < 16) {
      top = triggerRect.bottom + 14;
    }

    left = Math.max(16, Math.min(window.innerWidth - winWidth - 16, left));
    top = Math.max(16, Math.min(window.innerHeight - winHeight - 16, top));

    this.chatWindow.style.left = `${left}px`;
    this.chatWindow.style.top = `${top}px`;
    this.chatWindow.style.right = 'auto';
    this.chatWindow.style.bottom = 'auto';
  }

  toggleChat(forceState = null) {
    if (this.suppressTriggerClick) return;
    this.isOpen = forceState !== null ? forceState : !this.isOpen;

    if (this.isOpen && !this.hasDraggedWindow) {
      this.positionChatWindowNearTrigger();
    }

    this.chatWindow.classList.toggle('open', this.isOpen);

    if (this.isOpen) {
      setTimeout(() => this.chatInput.focus(), 250);
      const pulse = this.triggerBtn.querySelector('.badge-pulse');
      if (pulse) pulse.style.display = 'none';
    }
  }

  showApiKeyModal() {
    this.apiKeyInput.value = this.apiKey;
    this.apiKeyModal.classList.add('show');
  }

  hideApiKeyModal() {
    this.apiKeyModal.classList.remove('show');
  }

  updateApiKeyStatus() {
    if (this.apiKey) {
      const masked = this.apiKey.slice(0, 7) + '...' + this.apiKey.slice(-4);
      this.apiKeyStatusText.textContent = `API 키: ${masked}`;
      this.deleteApiKeyBtn.style.display = 'inline-block';
    } else {
      this.apiKeyStatusText.textContent = `API 키: 미설정 (체험 모드)`;
      this.deleteApiKeyBtn.style.display = 'none';
    }
  }

  renderInitialMessages() {
    this.chatMessages.innerHTML = '';
    this.messages.filter(m => m.role !== 'system').forEach(msg => {
      if (msg.role === 'user') {
        this.appendUserMessageUI(msg.content);
      } else {
        this.appendBotMessageUI(msg.content);
      }
    });
  }

  async sendMessage() {
    const text = this.chatInput.value.trim();
    if (!text) return;

    this.chatInput.value = '';
    this.appendUserMessageUI(text);
    this.messages.push({ role: 'user', content: text });

    // 타이핑 인디케이터 표시
    const typingIndicator = this.showTypingIndicator();

    try {
      let replyContent = "";

      if (this.apiKey) {
        // 실제 OpenAI API 호출 (gpt-5-mini 또는 fallback)
        replyContent = await this.callOpenAIAPI(this.messages);
      } else {
        // API 키가 없을 때 로컬 지능형 응답 제공 (체험 모드)
        await new Promise(res => setTimeout(res, 600)); // 자연스러운 타이핑 딜레이
        replyContent = this.generateLocalResponse(text);
      }

      typingIndicator.remove();
      this.appendBotMessageUI(replyContent);
      this.messages.push({ role: 'assistant', content: replyContent });

    } catch (err) {
      console.error("챗봇 API 호출 오류:", err);
      typingIndicator.remove();
      this.appendBotMessageUI(`⚠️ 오류가 발생했습니다: ${err.message}\n\n상단 설정(⚙️)에서 API 키를 다시 확인하거나 등록해 주세요.`);
    }
  }

  async callOpenAIAPI(messages) {
    let modelToTry = this.modelName; // gpt-5-mini
    let response;

    try {
      // gpt-5 계열 및 최신 모델은 temperature 커스텀(0.7 등)을 허용하지 않고 기본값(1)만 지원하므로 temperature 파라미터를 생략합니다.
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: modelToTry,
          messages: messages
        })
      });

      // 만약 gpt-5-mini가 지원되지 않는 경우 gpt-4o-mini로 fallback 시도
      if (!response.ok && response.status === 404) {
        response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: messages
          })
        });
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `API 요청 실패 (HTTP ${response.status})`);
      }

      const data = await response.json();
      return data.choices[0].message.content;

    } catch (error) {
      throw error;
    }
  }

  // API 키가 없는 경우에도 한국 산 질문에 똑똑하게 답변하는 로컬 지능형 엔진
  generateLocalResponse(query) {
    const q = query.toLowerCase();

    // 특정 산 검색 매칭
    const matchedMountain = MOUNTAIN_DATA.find(m => 
      q.includes(m.name) || q.includes(m.peak)
    );

    if (matchedMountain) {
      return `⛰️ **${matchedMountain.name} (${matchedMountain.peak})** 정보입니다!\n\n` +
             `• **해발 고도**: **${matchedMountain.elevation.toLocaleString()}m**\n` +
             `• **산맥 및 지역**: ${matchedMountain.range} (${matchedMountain.region})\n` +
             `• **난이도**: ${matchedMountain.difficulty}\n` +
             `• **특징**: ${matchedMountain.description}\n` +
             `• **주요 볼거리**: ${matchedMountain.highlights.join(', ')}\n\n` +
             `👉 아래 버튼을 누르면 3D 지형으로 즉시 이동하여 둘러볼 수 있습니다!`;
    }

    if (q.includes("가장 높은") || q.includes("최고봉") || q.includes("순위")) {
      const top5 = [...MOUNTAIN_DATA].sort((a, b) => b.elevation - a.elevation).slice(0, 5);
      let res = `대한민국에서 가장 높은 산 TOP 5입니다 🏔️:\n\n`;
      top5.forEach((m, idx) => {
        res += `${idx + 1}. **${m.name} (${m.peak})** - ${m.elevation.toLocaleString()}m (${m.region})\n`;
      });
      res += `\n지형에서 직접 확인하고 싶으신 산을 말씀해주세요!`;
      return res;
    }

    if (q.includes("초보") || q.includes("쉬운") || q.includes("추천")) {
      return `초보자분들도 가볍게 오르기 좋은 추천 명산입니다 🌿:\n\n` +
             `1. **인왕산 (338m)**: 한양도성 성곽길을 따라 서울 도심 파노라마 야경 감상 가능\n` +
             `2. **마니산 (472m)**: 완만한 단군로 숲길과 서해 낙조 조망\n` +
             `3. **남한산 (497m)**: 유네스코 세계문화유산 성곽 트레킹과 완만한 코스\n` +
             `4. **선운산 (336m)**: 가을 꽃무릇과 도솔암 흙길 산책로\n\n` +
             `원하시는 산을 클릭하시면 3D 지도로 산세를 확인하실 수 있습니다!`;
    }

    if (q.includes("안녕") || q.includes("반가워") || q.includes("소개")) {
      return `반갑습니다! 저는 3D 지형 탐색 도우미 **gpt-5-mini**입니다.\n` +
             `• 특정 산의 고도나 특징이 궁금하시면 산 이름을 말씀해주세요. (예: "지리산 천왕봉 어때?", "설악산 난이도")\n` +
             `• 상단 설정(⚙️)에 OpenAI API 키를 입력하시면 더 다양한 대화와 실시간 GPT 질의응답을 즐기실 수 있습니다!`;
    }

    return `궁금하신 질문에 대해 답변해 드립니다! 🏔️\n` +
           `대한민국의 산과 고도에 관한 구체적인 명칭(예: **설악산**, **지리산**, **한라산**, **북한산** 등)을 말씀해주시면 더 정밀한 지형 분석과 3D 위치를 안내해 드릴 수 있습니다.\n\n` +
           `*(💡 더 폭넓은 자유 대화를 원하시면 상단 ⚙️ 아이콘에서 API 키를 등록하시면 gpt-5-mini 모델과 직접 연동됩니다)*`;
  }

  appendUserMessageUI(text) {
    const msgDiv = document.createElement('div');
    msgDiv.className = 'message user';
    const time = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

    msgDiv.innerHTML = `
      <div class="msg-bubble">${this.escapeHTML(text)}</div>
      <div class="msg-time">${time}</div>
    `;

    this.chatMessages.appendChild(msgDiv);
    this.scrollToBottom();
  }

  appendBotMessageUI(text) {
    const msgDiv = document.createElement('div');
    msgDiv.className = 'message bot';
    const time = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

    // 간단한 마크다운 파싱 (볼드, 줄바꿈)
    let formattedText = this.escapeHTML(text)
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');

    msgDiv.innerHTML = `
      <div class="msg-bubble">${formattedText}</div>
      <div class="msg-time">${time}</div>
    `;

    // 텍스트 안에 산 이름이 포함되어 있으면 바로가기 버튼 생성
    const foundMountain = MOUNTAIN_DATA.find(m => text.includes(m.name));
    if (foundMountain) {
      const bubble = msgDiv.querySelector('.msg-bubble');
      const btn = document.createElement('button');
      btn.className = 'mountain-link-btn';
      btn.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="m8 3 4 8 5-5 5 15H2L8 3z"/>
        </svg>
        3D 지도에서 ${foundMountain.name} 바로보기
      `;
      btn.addEventListener('click', () => {
        this.map.selectMountain(foundMountain);
      });
      bubble.appendChild(document.createElement('br'));
      bubble.appendChild(btn);
    }

    this.chatMessages.appendChild(msgDiv);
    this.scrollToBottom();
  }

  appendBotMessage(text) {
    this.appendBotMessageUI(text);
    this.messages.push({ role: 'assistant', content: text });
  }

  showTypingIndicator() {
    const indDiv = document.createElement('div');
    indDiv.className = 'typing-indicator';
    indDiv.innerHTML = `
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    `;
    this.chatMessages.appendChild(indDiv);
    this.scrollToBottom();
    return indDiv;
  }

  scrollToBottom() {
    this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
  }

  escapeHTML(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
