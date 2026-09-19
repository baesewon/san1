import { MOUNTAIN_DATA, REGIONS } from '../data/mountains.js';

export class UIManager {
  constructor(mapInstance, elevationInstance) {
    this.map = mapInstance;
    this.elevation = elevationInstance;
    this.filteredMountains = [...MOUNTAIN_DATA];
    this.currentRegion = 'all';
    this.searchQuery = '';
    this.sortBy = 'elevation'; // 'elevation' or 'name'

    this.initElements();
    this.setupListeners();
    this.renderRegionTags();
    this.renderMountainList();
  }

  initElements() {
    this.sidebar = document.getElementById('sidebar');
    this.sidebarToggle = document.getElementById('sidebar-toggle');
    this.searchInput = document.getElementById('search-input');
    this.mountainList = document.getElementById('mountain-list');
    this.regionTags = document.getElementById('region-tags');
    this.mountainCount = document.getElementById('mountain-count');
    this.detailModal = document.getElementById('detail-modal');

    this.orbitBtn = document.getElementById('orbit-btn');
    this.resetBtn = document.getElementById('reset-btn');
    this.profileBtn = document.getElementById('profile-btn');
    this.profileCloseBtn = document.getElementById('close-profile');
    this.exaggerationSlider = document.getElementById('exaggeration-slider');
    this.exaggerationVal = document.getElementById('exaggeration-val');
    this.opacitySlider = document.getElementById('opacity-slider');
    this.opacityVal = document.getElementById('opacity-val');

    // 고도 단면도 중앙 플로팅 가이드 배너 요소
    this.profileBanner = document.getElementById('profile-guide-banner');
    this.guideIconBox = document.getElementById('guide-icon-box');
    this.guideStepTag = document.getElementById('guide-step-tag');
    this.guideMainMsg = document.getElementById('guide-main-msg');
    this.guideCancelBtn = document.getElementById('guide-cancel-btn');
  }

  setupListeners() {
    // 사이드바 접기/펼치기
    this.sidebarToggle.addEventListener('click', () => {
      const isCollapsed = this.sidebar.classList.toggle('collapsed');
      this.sidebarToggle.classList.toggle('collapsed', isCollapsed);
    });

    // 검색 입력
    this.searchInput.addEventListener('input', (e) => {
      this.searchQuery = e.target.value.trim().toLowerCase();
      this.filterAndRender();
    });

    // 지도 베이스 레이어 버튼
    document.querySelectorAll('[data-layer]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('[data-layer]').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        const layer = e.currentTarget.dataset.layer;
        this.map.setLayer(layer);
      });
    });

    // 지형 과장도 슬라이더
    this.exaggerationSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      this.exaggerationVal.textContent = `${val.toFixed(1)}x`;
      this.map.setExaggeration(val);
    });

    // 아이콘 투명도 슬라이더
    if (this.opacitySlider) {
      this.opacitySlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (this.opacityVal) {
          this.opacityVal.textContent = `${Math.round(val * 100)}%`;
        }
        this.map.setMarkerOpacity(val);
      });
    }

    // 3D 궤도 회전 버튼
    this.orbitBtn.addEventListener('click', () => {
      const isOrbiting = this.map.toggleOrbit();
      this.orbitBtn.classList.toggle('active', isOrbiting);
    });

    // 초기화 버튼
    this.resetBtn.addEventListener('click', () => {
      this.map.resetView();
      this.orbitBtn.classList.remove('active');
      this.closeDetailModal();
      this.elevation.hideProfile();
      this.map.cancelProfileMode();
      this.profileBtn.classList.remove('active');
      if (this.profileBanner) this.profileBanner.classList.remove('show');
    });

    // 고도 단면 프로파일 측정 모드 버튼 (브라우저 alert 대신 세련된 플로팅 가이드 카드 표시)
    this.profileBtn.addEventListener('click', () => {
      if (this.map.profileMode) {
        this.map.cancelProfileMode();
        this.profileBtn.classList.remove('active');
      } else {
        this.map.startProfileMode();
        this.profileBtn.classList.add('active');
      }
    });

    // 가이드 배너 취소 버튼
    if (this.guideCancelBtn) {
      this.guideCancelBtn.addEventListener('click', () => {
        this.map.cancelProfileMode();
        this.profileBtn.classList.remove('active');
      });
    }

    // 마커 표시/숨기기 토글 버튼
    this.markerToggleBtn = document.getElementById('marker-toggle-btn');
    this.markersVisible = true;
    if (this.markerToggleBtn) {
      this.markerToggleBtn.addEventListener('click', () => {
        this.markersVisible = !this.markersVisible;
        this.markerToggleBtn.classList.toggle('active', this.markersVisible);
        if (this.markersVisible) {
          this.map.showMarkersFor(this.filteredMountains);
        } else {
          this.map.clearMarkers();
        }
      });
    }

    // 고도계 HUD 토글 및 닫기 버튼
    this.bottomHud = document.getElementById('bottom-hud');
    this.hudToggleBtn = document.getElementById('hud-toggle-btn');
    this.closeHudBtn = document.getElementById('close-hud-btn');
    this.hudVisible = true;

    const setHudVisibility = (visible) => {
      this.hudVisible = visible;
      if (this.bottomHud) {
        this.bottomHud.classList.toggle('hidden', !visible);
      }
      if (this.hudToggleBtn) {
        this.hudToggleBtn.classList.toggle('active', visible);
      }
    };

    if (this.hudToggleBtn) {
      this.hudToggleBtn.addEventListener('click', () => {
        setHudVisibility(!this.hudVisible);
      });
    }

    if (this.closeHudBtn) {
      this.closeHudBtn.addEventListener('click', () => {
        setHudVisibility(false);
      });
    }

    // 단면도 닫기
    if (this.profileCloseBtn) {
      this.profileCloseBtn.addEventListener('click', () => {
        this.elevation.hideProfile();
        this.map.clearProfileLine();
        this.profileBtn.classList.remove('active');
      });
    }

    // 지도에서 산 선택 이벤트 연결
    this.map.onMountainSelect = (mountain) => {
      this.showDetailModal(mountain);
      this.highlightCard(mountain.id);
    };

    // 고도 단면 측정 단계별 가이드 배너 상태 갱신 연결
    this.map.onProfileStep = (step) => {
      if (!this.profileBanner) return;
      if (step === 'step1') {
        this.profileBanner.classList.add('show');
        if (this.guideIconBox) {
          this.guideIconBox.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 2v20M2 12h20"/>
            </svg>
          `;
        }
        if (this.guideStepTag) {
          this.guideStepTag.innerHTML = `<span>●</span> 1단계: 시작 지점 선택`;
        }
        if (this.guideMainMsg) {
          this.guideMainMsg.textContent = '3D 지도에서 단면 측정을 시작할 첫 번째 지점을 클릭하세요';
        }
      } else if (step === 'step2') {
        this.profileBanner.classList.add('show');
        if (this.guideIconBox) {
          this.guideIconBox.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
              <line x1="4" y1="22" x2="4" y2="15"/>
            </svg>
          `;
        }
        if (this.guideStepTag) {
          this.guideStepTag.innerHTML = `<span style="color:var(--accent-emerald)">●</span> 2단계: 도착 지점 선택`;
        }
        if (this.guideMainMsg) {
          this.guideMainMsg.textContent = '도착 지점을 클릭하면 실시간 고도 단면도가 생성됩니다';
        }
      } else if (step === 'done' || step === 'cancel') {
        this.profileBanner.classList.remove('show');
      }
    };

    // 고도 단면 측정 완료 연결
    this.map.onProfileComplete = (profileData) => {
      this.profileBtn.classList.remove('active');
      if (this.profileBanner) {
        this.profileBanner.classList.remove('show');
      }
      this.elevation.showProfile(profileData);
    };
  }

  renderRegionTags() {
    this.regionTags.innerHTML = '';
    REGIONS.forEach(reg => {
      const btn = document.createElement('button');
      btn.className = `tag-btn ${reg.id === this.currentRegion ? 'active' : ''}`;
      btn.textContent = reg.name;
      btn.addEventListener('click', () => {
        this.currentRegion = reg.id;
        document.querySelectorAll('.tag-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.filterAndRender();
      });
      this.regionTags.appendChild(btn);
    });
  }

  filterAndRender() {
    this.filteredMountains = MOUNTAIN_DATA.filter(m => {
      // 지역 필터
      const matchRegion = this.currentRegion === 'all' || m.region.includes(
        REGIONS.find(r => r.id === this.currentRegion).name.split('(')[0]
      );

      // 검색 필터 (일반 검색 + 초성 검색 지원)
      let matchSearch = true;
      if (this.searchQuery) {
        const textToSearch = `${m.name} ${m.peak} ${m.range} ${m.region}`.toLowerCase();
        const chosung = this.extractChosung(`${m.name} ${m.peak}`);
        matchSearch = textToSearch.includes(this.searchQuery) || chosung.includes(this.searchQuery);
      }

      return matchRegion && matchSearch;
    });

    // 정렬 (기본: 해발 고도 높은 순)
    this.filteredMountains.sort((a, b) => b.elevation - a.elevation);

    this.renderMountainList();

    // 현재 필터/검색된 산 마커들을 지도에 표시 (고도별 색상 적용)
    if (this.markersVisible !== false) {
      this.map.showMarkersFor(this.filteredMountains);
    }
  }

  renderMountainList() {
    this.mountainList.innerHTML = '';
    if (this.mountainCount) {
      this.mountainCount.textContent = `${this.filteredMountains.length}개 산`;
    }

    if (this.filteredMountains.length === 0) {
      this.mountainList.innerHTML = `
        <div style="text-align:center; padding: 40px 10px; color: var(--text-muted); font-size:13px;">
          검색 결과에 해당하는 산이 없습니다.
        </div>
      `;
      return;
    }

    this.filteredMountains.forEach(m => {
      const card = document.createElement('div');
      card.className = 'mountain-card';
      card.id = `card-${m.id}`;

      card.innerHTML = `
        <div class="card-top">
          <span class="mountain-name">${m.name} <span style="font-size:11px; font-weight:normal; color:#94a3b8">(${m.peak})</span></span>
          <span class="elevation-badge">${m.elevation.toLocaleString()}m</span>
        </div>
        <div class="card-details">
          <span>${m.range}</span>
          <span>${m.region}</span>
        </div>
        <div class="card-desc">${m.description}</div>
      `;

      card.addEventListener('click', () => {
        this.map.selectMountain(m);
        this.showDetailModal(m);
        this.highlightCard(m.id);
      });

      this.mountainList.appendChild(card);
    });
  }

  highlightCard(mountainId) {
    document.querySelectorAll('.mountain-card').forEach(c => c.classList.remove('active'));
    const target = document.getElementById(`card-${mountainId}`);
    if (target) {
      target.classList.add('active');
      target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  showDetailModal(mountain) {
    if (!this.detailModal) return;

    this.detailModal.innerHTML = `
      <div class="detail-header">
        <div>
          <div class="detail-name">${mountain.name} <span style="font-size:14px; font-weight:500; color:#38bdf8">${mountain.peak}</span></div>
          <div class="detail-region">${mountain.region} | ${mountain.range}</div>
        </div>
        <button class="close-btn" id="close-detail">✕</button>
      </div>

      <div class="detail-badge-group">
        <span class="badge-tag elev">해발 ${mountain.elevation.toLocaleString()}m</span>
        <span class="badge-tag">난이도: ${mountain.difficulty}</span>
      </div>

      <div class="detail-desc">${mountain.description}</div>

      <div class="detail-highlights">
        <div style="font-size:11px; font-weight:700; color:#cbd5e1; margin-bottom:2px;">주요 명소 / 경관</div>
        ${mountain.highlights.map(h => `
          <div class="highlight-item">
            <div class="highlight-dot"></div>
            <span>${h}</span>
          </div>
        `).join('')}
      </div>

      <button class="fly-orbit-btn" id="modal-orbit-btn">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.85.83 6.72 2.24"/>
          <path d="M21 3v6h-6"/>
        </svg>
        360° 3D 입체 궤도 비행 시작
      </button>
    `;

    this.detailModal.style.display = 'block';

    document.getElementById('close-detail').addEventListener('click', () => {
      this.closeDetailModal();
    });

    document.getElementById('modal-orbit-btn').addEventListener('click', () => {
      this.map.selectMountain(mountain, false);
      setTimeout(() => {
        this.map.startOrbit();
        this.orbitBtn.classList.add('active');
      }, 1200);
    });
  }

  closeDetailModal() {
    if (this.detailModal) {
      this.detailModal.style.display = 'none';
    }
  }

  // 한글 초성 추출 유틸리티
  extractChosung(text) {
    const CHOSUNG = [
      'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ',
      'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'
    ];
    let result = '';
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i) - 44032;
      if (code >= 0 && code <= 11171) {
        result += CHOSUNG[Math.floor(code / 588)];
      } else {
        result += text.charAt(i);
      }
    }
    return result;
  }
}
