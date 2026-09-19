import { MOUNTAIN_DATA } from '../data/mountains.js';

export class Korea3DMap {
  constructor() {
    this.map = null;
    this.currentBaseLayer = 'satellite';
    this.terrainExaggeration = 1.5;
    this.orbitAnimationId = null;
    this.isOrbiting = false;
    this.markers = [];
    this.currentPopup = null;
    this.markerOpacity = 0.3; // 기본 상태: 안 볼 때는 반투명(0.3)으로 지형을 전혀 가리지 않음
    this.hoveredMountainId = null;
    this.selectedMountain = null;
    this.onElevationHover = null;
    this.onMountainSelect = null;
    this.profileMode = false;
    this.profilePoints = [];
    this.onProfileComplete = null;
    this.onProfileStep = null;
  }

  init(containerId = 'map') {
    // 대한민국 중심 (설악산과 지리산 등 전체 산세를 아우르는 뷰)
    const initialCenter = [127.7, 36.3];

    this.map = new maplibregl.Map({
      container: containerId,
      style: this.getMapStyle('satellite'),
      center: initialCenter,
      zoom: 7.2,
      pitch: 58,
      bearing: -15,
      maxPitch: 85,
      antialias: true
    });

    // 기본 컨트롤러
    this.map.addControl(new maplibregl.NavigationControl({
      visualizePitch: true,
      showZoom: true,
      showCompass: true
    }), 'top-right');

    this.map.addControl(new maplibregl.ScaleControl({
      maxWidth: 100,
      unit: 'metric'
    }), 'bottom-left');

    this.activeMountains = [...MOUNTAIN_DATA];

    this.map.on('load', () => {
      this.setupTerrain();
      this.setupMountainWebGLLayers();
      this.renderMountainMarkers(MOUNTAIN_DATA);
      this.setupEventListeners();
    });
  }

  getMapStyle(layerType) {
    let rasterTiles = [];
    let attribution = '';

    if (layerType === 'satellite') {
      rasterTiles = [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
      ];
      attribution = 'Esri World Imagery, USGS, NASA';
    } else if (layerType === 'topo') {
      rasterTiles = [
        'https://tile.opentopomap.org/{z}/{x}/{y}.png'
      ];
      attribution = 'OpenTopoMap, OSM';
    } else if (layerType === 'hybrid') {
      rasterTiles = [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
      ];
      attribution = 'Esri World Imagery';
    }

    const sources = {
      'base-raster': {
        type: 'raster',
        tiles: rasterTiles,
        tileSize: 256,
        attribution: attribution,
        maxzoom: 18
      },
      'terrain-source': {
        type: 'raster-dem',
        tiles: [
          'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
        ],
        encoding: 'terrarium',
        tileSize: 256,
        maxzoom: 14
      }
    };

    const layers = [
      {
        id: 'base-layer',
        type: 'raster',
        source: 'base-raster',
        paint: {
          'raster-opacity': 1.0,
          'raster-fade-duration': 300
        }
      }
    ];

    if (layerType === 'hybrid') {
      sources['reference-labels'] = {
        type: 'raster',
        tiles: [
          'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'
        ],
        tileSize: 256,
        maxzoom: 18
      };
      layers.push({
        id: 'labels-layer',
        type: 'raster',
        source: 'reference-labels',
        paint: { 'raster-opacity': 0.85 }
      });
    }

    return {
      version: 8,
      glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
      sources: sources,
      layers: layers,
      sky: {
        'sky-color': '#0b1120',
        'sky-horizon-blend': 0.5,
        'horizon-color': '#1e293b',
        'horizon-fog-blend': 0.8,
        'fog-color': '#0f172a',
        'fog-ground-blend': 0.7
      }
    };
  }

  setupTerrain() {
    if (!this.map.getSource('terrain-source')) {
      this.map.addSource('terrain-source', {
        type: 'raster-dem',
        tiles: [
          'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
        ],
        encoding: 'terrarium',
        tileSize: 256,
        maxzoom: 14
      });
    }

    this.map.setTerrain({
      source: 'terrain-source',
      exaggeration: this.terrainExaggeration
    });
  }

  setLayer(layerType) {
    if (this.currentBaseLayer === layerType) return;
    this.currentBaseLayer = layerType;

    const center = this.map.getCenter();
    const zoom = this.map.getZoom();
    const pitch = this.map.getPitch();
    const bearing = this.map.getBearing();

    this.map.setStyle(this.getMapStyle(layerType));

    this.map.once('style.load', () => {
      this.setupTerrain();
      this.setupMountainWebGLLayers();
      this.map.setCenter(center);
      this.map.setZoom(zoom);
      this.map.setPitch(pitch);
      this.renderMountainMarkers(this.activeMountains);
      if (this.profilePoints.length > 0) {
        this.renderProfileLine();
      }
    });
  }

  setExaggeration(val) {
    this.terrainExaggeration = parseFloat(val);
    if (this.map && this.map.getSource('terrain-source')) {
      this.map.setTerrain({
        source: 'terrain-source',
        exaggeration: this.terrainExaggeration
      });
    }
  }

  setupMountainWebGLLayers() {
    if (!this.map.getSource('mountain-markers-source')) {
      this.map.addSource('mountain-markers-source', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: []
        }
      });
    }

    // 1. 호버/선택 시 은은하게 빛나는 외곽 글로우 링
    if (!this.map.getLayer('mountain-glow-layer')) {
      this.map.addLayer({
        id: 'mountain-glow-layer',
        type: 'circle',
        source: 'mountain-markers-source',
        paint: {
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            6, 9,
            12, 18
          ],
          'circle-color': [
            'case',
            ['>=', ['get', 'elevation'], 1300], '#ef4444',
            ['>=', ['get', 'elevation'], 700], '#10b981',
            '#38bdf8'
          ],
          'circle-blur': 0.75,
          'circle-opacity': [
            'case',
            ['boolean', ['feature-state', 'hover'], false], 0.75,
            ['boolean', ['feature-state', 'selected'], false], 0.85,
            0
          ]
        }
      });
    }

    // 2. 메인 산 지점 원형 마커 레이어 (3D 지형에 완벽 밀착되어 딜레이 0%)
    // 안 볼 때는 투명(0.3)하여 아래 지형, 골짜기, 능선을 가리지 않음!
    if (!this.map.getLayer('mountain-circle-layer')) {
      this.map.addLayer({
        id: 'mountain-circle-layer',
        type: 'circle',
        source: 'mountain-markers-source',
        paint: {
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            6, 4.5,
            10, 7,
            14, 10
          ],
          'circle-color': [
            'case',
            ['>=', ['get', 'elevation'], 1300], '#ef4444',
            ['>=', ['get', 'elevation'], 700], '#10b981',
            '#38bdf8'
          ],
          'circle-opacity': [
            'case',
            ['boolean', ['feature-state', 'hover'], false], 1.0,
            ['boolean', ['feature-state', 'selected'], false], 1.0,
            this.markerOpacity // 기본 0.3 (투명)
          ],
          'circle-stroke-width': 1.8,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-opacity': [
            'case',
            ['boolean', ['feature-state', 'hover'], false], 1.0,
            ['boolean', ['feature-state', 'selected'], false], 1.0,
            Math.min(1.0, this.markerOpacity * 1.6)
          ]
        }
      });
    }

    // 3. 산 이름 및 고도 텍스트 라벨 레이어
    if (!this.map.getLayer('mountain-label-layer')) {
      this.map.addLayer({
        id: 'mountain-label-layer',
        type: 'symbol',
        source: 'mountain-markers-source',
        layout: {
          'text-field': ['concat', ['get', 'name'], ' ', ['to-string', ['get', 'elevation']], 'm'],
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
          'text-size': [
            'interpolate', ['linear'], ['zoom'],
            7, 10,
            11, 12
          ],
          'text-offset': [0, 1.3],
          'text-anchor': 'top',
          'text-allow-overlap': false
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': 'rgba(11, 15, 25, 0.95)',
          'text-halo-width': 2.0,
          'text-opacity': [
            'case',
            ['boolean', ['feature-state', 'hover'], false], 1.0,
            ['boolean', ['feature-state', 'selected'], false], 1.0,
            ['>=', ['zoom'], 9.5], Math.max(0.2, this.markerOpacity),
            0 // 멀리서 볼 땐 라벨 숨김
          ]
        }
      });
    }

    // 마우스 호버 이벤트
    this.map.on('mouseenter', 'mountain-circle-layer', (e) => {
      this.map.getCanvas().style.cursor = 'pointer';
      if (e.features && e.features.length > 0) {
        if (this.hoveredMountainId !== null) {
          this.map.setFeatureState(
            { source: 'mountain-markers-source', id: this.hoveredMountainId },
            { hover: false }
          );
        }
        this.hoveredMountainId = e.features[0].id;
        this.map.setFeatureState(
          { source: 'mountain-markers-source', id: this.hoveredMountainId },
          { hover: true }
        );
      }
    });

    this.map.on('mouseleave', 'mountain-circle-layer', () => {
      this.map.getCanvas().style.cursor = '';
      if (this.hoveredMountainId !== null) {
        this.map.setFeatureState(
          { source: 'mountain-markers-source', id: this.hoveredMountainId },
          { hover: false }
        );
        this.hoveredMountainId = null;
      }
    });

    // 아이콘 클릭 시 산 정보 팝업 표시 및 비행
    this.map.on('click', 'mountain-circle-layer', (e) => {
      if (!e.features || e.features.length === 0) return;
      const mountainId = e.features[0].properties.id;
      const mountain = MOUNTAIN_DATA.find(m => m.id === mountainId);
      if (mountain) {
        this.selectMountain(mountain);
      }
    });
  }

  renderMountainMarkers(mountains = this.activeMountains) {
    this.activeMountains = mountains || [];
    const source = this.map && this.map.getSource('mountain-markers-source');
    if (!source) return;

    const features = this.activeMountains.map((m, index) => ({
      type: 'Feature',
      id: index + 1,
      geometry: {
        type: 'Point',
        coordinates: m.coordinates
      },
      properties: {
        id: m.id,
        name: m.name,
        peak: m.peak,
        elevation: m.elevation,
        region: m.region,
        range: m.range,
        description: m.description,
        difficulty: m.difficulty,
        highlights: JSON.stringify(m.highlights || [])
      }
    }));

    source.setData({
      type: 'FeatureCollection',
      features: features
    });
  }

  showMarkersFor(mountains) {
    this.renderMountainMarkers(mountains);
  }

  clearMarkers() {
    this.renderMountainMarkers([]);
    if (this.currentPopup) {
      this.currentPopup.remove();
      this.currentPopup = null;
    }
  }

  setMarkerOpacity(val) {
    this.markerOpacity = parseFloat(val);
    if (this.map && this.map.getLayer('mountain-circle-layer')) {
      this.map.setPaintProperty('mountain-circle-layer', 'circle-opacity', [
        'case',
        ['boolean', ['feature-state', 'hover'], false], 1.0,
        ['boolean', ['feature-state', 'selected'], false], 1.0,
        this.markerOpacity
      ]);
      this.map.setPaintProperty('mountain-circle-layer', 'circle-stroke-opacity', [
        'case',
        ['boolean', ['feature-state', 'hover'], false], 1.0,
        ['boolean', ['feature-state', 'selected'], false], 1.0,
        Math.min(1.0, this.markerOpacity * 1.6)
      ]);
    }
  }

  showMountainInfoPopup(mountain) {
    if (this.currentPopup) {
      this.currentPopup.remove();
      this.currentPopup = null;
    }

    let elevColor = '#38bdf8';
    let elevBg = 'rgba(6, 182, 212, 0.15)';
    let elevBorder = 'rgba(6, 182, 212, 0.3)';

    if (mountain.elevation >= 1300) {
      elevColor = '#f87171';
      elevBg = 'rgba(239, 68, 68, 0.18)';
      elevBorder = 'rgba(239, 68, 68, 0.35)';
    } else if (mountain.elevation >= 700) {
      elevColor = '#34d399';
      elevBg = 'rgba(16, 185, 129, 0.18)';
      elevBorder = 'rgba(16, 185, 129, 0.35)';
    }

    const popupHTML = `
      <div style="display:flex; flex-direction:column; gap:10px; font-family:var(--font-sans);">
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div>
            <div style="font-size:17px; font-weight:800; color:#fff; display:flex; align-items:center; gap:6px;">
              ${mountain.name} <span style="font-size:13px; font-weight:600; color:#38bdf8">(${mountain.peak})</span>
            </div>
            <div style="font-size:11px; color:#94a3b8; margin-top:2px;">${mountain.region} · ${mountain.range}</div>
          </div>
          <span style="font-size:12px; font-weight:800; color:${elevColor}; background:${elevBg}; padding:3px 8px; border-radius:6px; border:1px solid ${elevBorder};">
            ${mountain.elevation.toLocaleString()}m
          </span>
        </div>

        <div style="font-size:12px; color:#cbd5e1; line-height:1.5;">
          ${mountain.description}
        </div>

        <div style="display:flex; flex-direction:column; gap:4px; font-size:11px; color:#94a3b8;">
          <span style="font-weight:700; color:#e2e8f0;">주요 명소 / 코스:</span>
          <div style="display:flex; flex-wrap:wrap; gap:4px;">
            ${(mountain.highlights || []).map(h => `<span style="background:rgba(255,255,255,0.08); padding:2px 7px; border-radius:4px; border:1px solid rgba(255,255,255,0.1); color:#e2e8f0;">${h}</span>`).join('')}
          </div>
        </div>

        <div style="display:flex; gap:6px; margin-top:4px;">
          <button class="fly-orbit-btn" id="popup-orbit-btn" style="flex:1; padding:7px; font-size:11px; border-radius:6px;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.85.83 6.72 2.24"/><path d="M21 3v6h-6"/>
            </svg>
            360° 궤도 비행
          </button>
          <button class="fly-orbit-btn" id="popup-chat-btn" style="flex:1; background:linear-gradient(135deg, #059669, #10b981); padding:7px; font-size:11px; border-radius:6px;">
            💬 AI에게 코스 묻기
          </button>
        </div>
      </div>
    `;

    this.currentPopup = new maplibregl.Popup({
      offset: 16,
      closeButton: true,
      closeOnClick: false,
      anchor: 'bottom'
    })
      .setLngLat(mountain.coordinates)
      .setHTML(popupHTML)
      .addTo(this.map);

    // 팝업 내부 버튼 이벤트 연결
    setTimeout(() => {
      const orbitBtn = document.getElementById('popup-orbit-btn');
      if (orbitBtn) {
        orbitBtn.addEventListener('click', () => {
          this.startOrbit();
          const mainOrbitBtn = document.getElementById('orbit-btn');
          if (mainOrbitBtn) mainOrbitBtn.classList.add('active');
        });
      }

      const chatBtn = document.getElementById('popup-chat-btn');
      if (chatBtn) {
        chatBtn.addEventListener('click', () => {
          const chatTrigger = document.getElementById('chatbot-trigger');
          const chatInput = document.getElementById('chat-input');
          const chatSendBtn = document.getElementById('chat-send-btn');
          const chatWindow = document.getElementById('chatbot-window');
          if (chatWindow && !chatWindow.classList.contains('open') && chatTrigger) {
            chatTrigger.click();
          }
          if (chatInput && chatSendBtn) {
            chatInput.value = `${mountain.name}의 등산 코스와 난이도에 대해 자세히 알려줘`;
            chatSendBtn.click();
          }
        });
      }
    }, 50);
  }

  selectMountain(mountain, triggerCallback = true) {
    this.selectedMountain = mountain;
    this.stopOrbit();

    // 3D 카메라 비행
    this.map.flyTo({
      center: mountain.coordinates,
      zoom: 13.5,
      pitch: 65,
      bearing: -20,
      speed: 1.2,
      curve: 1.4,
      essential: true
    });

    // 산 정보 팝업 띄우기
    this.showMountainInfoPopup(mountain);

    if (triggerCallback && this.onMountainSelect) {
      this.onMountainSelect(mountain);
    }
  }

  startOrbit() {
    if (this.isOrbiting) return;
    this.isOrbiting = true;

    const rotateCamera = () => {
      if (!this.isOrbiting) return;
      const currentBearing = this.map.getBearing();
      this.map.setBearing(currentBearing + 0.25);
      this.orbitAnimationId = requestAnimationFrame(rotateCamera);
    };

    rotateCamera();
  }

  stopOrbit() {
    this.isOrbiting = false;
    if (this.orbitAnimationId) {
      cancelAnimationFrame(this.orbitAnimationId);
      this.orbitAnimationId = null;
    }
  }

  toggleOrbit() {
    if (this.isOrbiting) {
      this.stopOrbit();
      return false;
    } else {
      this.startOrbit();
      return true;
    }
  }

  resetView() {
    this.stopOrbit();
    this.showMarkersFor(MOUNTAIN_DATA);
    this.map.flyTo({
      center: [127.7, 36.3],
      zoom: 7.2,
      pitch: 58,
      bearing: -15,
      speed: 1.0,
      essential: true
    });
  }

  setupEventListeners() {
    // 마우스 호버 시 실시간 좌표 및 고도 추출
    this.map.on('mousemove', (e) => {
      if (this.onElevationHover) {
        const lngLat = e.lngLat;
        let elevation = null;

        try {
          if (this.map.queryTerrainElevation) {
            elevation = this.map.queryTerrainElevation(lngLat);
          }
        } catch (err) {
          elevation = null;
        }

        // 고도가 유효하지 않거나 0 미만일 경우 기본 0 처리 또는 최근접 산 참고
        if (elevation === null || isNaN(elevation)) {
          elevation = 0;
        }

        this.onElevationHover({
          lng: lngLat.lng,
          lat: lngLat.lat,
          elevation: Math.round(elevation)
        });
      }
    });

    // 지도 클릭 시 고도 단면 프로파일링 측정 모드 처리
    this.map.on('click', (e) => {
      if (!this.profileMode) return;

      const lngLat = e.lngLat;
      let elevation = 0;
      try {
        if (this.map.queryTerrainElevation) {
          elevation = this.map.queryTerrainElevation(lngLat) || 0;
        }
      } catch (err) {}

      this.profilePoints.push({
        lng: lngLat.lng,
        lat: lngLat.lat,
        elevation: Math.round(elevation)
      });

      if (this.profilePoints.length === 1) {
        if (this.onProfileStep) this.onProfileStep('step2');
      } else if (this.profilePoints.length >= 2) {
        if (this.onProfileStep) this.onProfileStep('done');
        this.finishProfile();
      }
    });

    // 드래그나 지도 조작 시 궤도 회전 일시 중지
    this.map.on('dragstart', () => {
      if (this.isOrbiting) {
        this.stopOrbit();
        const orbitBtn = document.getElementById('orbit-btn');
        if (orbitBtn) orbitBtn.classList.remove('active');
      }
    });
  }

  startProfileMode() {
    this.profileMode = true;
    this.profilePoints = [];
    this.map.getCanvas().style.cursor = 'crosshair';
    this.clearProfileLine();
    if (this.onProfileStep) this.onProfileStep('step1');
  }

  cancelProfileMode() {
    this.profileMode = false;
    this.profilePoints = [];
    this.map.getCanvas().style.cursor = '';
    this.clearProfileLine();
    if (this.onProfileStep) this.onProfileStep('cancel');
  }

  finishProfile() {
    this.profileMode = false;
    this.map.getCanvas().style.cursor = '';

    const p1 = this.profilePoints[0];
    const p2 = this.profilePoints[1];

    // 두 지점 사이를 정밀하게 60개 샘플로 분할하여 고도 추출
    const sampleCount = 60;
    const samples = [];
    const distanceKm = this.calculateDistance(p1.lat, p1.lng, p2.lat, p2.lng);

    for (let i = 0; i <= sampleCount; i++) {
      const t = i / sampleCount;
      const lng = p1.lng + (p2.lng - p1.lng) * t;
      const lat = p1.lat + (p2.lat - p1.lat) * t;
      let elev = 0;
      try {
        if (this.map.queryTerrainElevation) {
          elev = this.map.queryTerrainElevation([lng, lat]) || 0;
        }
      } catch (err) {
        elev = 0;
      }

      samples.push({
        distance: Number(((distanceKm * t)).toFixed(2)),
        elevation: Math.round(elev),
        lng: lng,
        lat: lat
      });
    }

    this.renderProfileLine();

    if (this.onProfileComplete) {
      this.onProfileComplete({
        start: p1,
        end: p2,
        distanceKm: distanceKm.toFixed(2),
        samples: samples
      });
    }
  }

  renderProfileLine() {
    if (this.profilePoints.length < 2) return;

    const p1 = this.profilePoints[0];
    const p2 = this.profilePoints[1];

    const geojson = {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          [p1.lng, p1.lat],
          [p2.lng, p2.lat]
        ]
      }
    };

    if (this.map.getSource('profile-line-source')) {
      this.map.getSource('profile-line-source').setData(geojson);
    } else {
      this.map.addSource('profile-line-source', {
        type: 'geojson',
        data: geojson
      });

      this.map.addLayer({
        id: 'profile-line-glow',
        type: 'line',
        source: 'profile-line-source',
        paint: {
          'line-color': '#06b6d4',
          'line-width': 6,
          'line-opacity': 0.4,
          'line-blur': 3
        }
      });

      this.map.addLayer({
        id: 'profile-line',
        type: 'line',
        source: 'profile-line-source',
        paint: {
          'line-color': '#38bdf8',
          'line-width': 3,
          'line-dasharray': [2, 1]
        }
      });
    }
  }

  clearProfileLine() {
    this.hideProfileHover();
    if (this.map.getLayer('profile-hover-inner')) {
      this.map.removeLayer('profile-hover-inner');
    }
    if (this.map.getLayer('profile-hover-outer')) {
      this.map.removeLayer('profile-hover-outer');
    }
    if (this.map.getSource('profile-hover-source')) {
      this.map.removeSource('profile-hover-source');
    }
    if (this.map.getLayer('profile-line')) {
      this.map.removeLayer('profile-line');
    }
    if (this.map.getLayer('profile-line-glow')) {
      this.map.removeLayer('profile-line-glow');
    }
    if (this.map.getSource('profile-line-source')) {
      this.map.removeSource('profile-line-source');
    }
  }

  // 고도 단면도 차트 호버 시 3D 지형 위 실시간 연동 마커 표시
  showProfileHover(point) {
    if (!this.map || !point || typeof point.lng !== 'number' || typeof point.lat !== 'number') return;
    const geojson = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [point.lng, point.lat]
        },
        properties: {
          elevation: point.elevation
        }
      }]
    };

    if (this.map.getSource('profile-hover-source')) {
      this.map.getSource('profile-hover-source').setData(geojson);
    } else {
      this.map.addSource('profile-hover-source', {
        type: 'geojson',
        data: geojson
      });

      this.map.addLayer({
        id: 'profile-hover-outer',
        type: 'circle',
        source: 'profile-hover-source',
        paint: {
          'circle-radius': 14,
          'circle-color': '#06b6d4',
          'circle-opacity': 0.5,
          'circle-blur': 0.4
        }
      });

      this.map.addLayer({
        id: 'profile-hover-inner',
        type: 'circle',
        source: 'profile-hover-source',
        paint: {
          'circle-radius': 5.5,
          'circle-color': '#ffffff',
          'circle-stroke-color': '#0284c7',
          'circle-stroke-width': 2.5
        }
      });
    }
  }

  hideProfileHover() {
    if (this.map && this.map.getSource('profile-hover-source')) {
      this.map.getSource('profile-hover-source').setData({
        type: 'FeatureCollection',
        features: []
      });
    }
  }

  // 고도 단면도 차트 클릭 시 해당 3D 지형 지점으로 카메라 부드럽게 이동
  flyToProfilePoint(point) {
    if (!this.map || !point || typeof point.lng !== 'number') return;
    this.map.flyTo({
      center: [point.lng, point.lat],
      zoom: Math.max(this.map.getZoom(), 12.5),
      speed: 1.2,
      curve: 1.4,
      essential: true
    });
  }

  // Haversine 거리 계산 (km)
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // 지구 반지름 (km)
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
}
