/**
 * 고도(Elevation) 측정 및 단면 프로파일 차트 렌더링 모듈
 * - 파란색 고도 곡선 위 마우스 호버 시 실시간 정밀 고도/거리 툴팁 및 3D 지도 위치 연동
 */
export class ElevationManager {
  constructor() {
    this.hudElevation = document.getElementById('hud-elevation');
    this.hudCoords = document.getElementById('hud-coords');
    this.hudSlope = document.getElementById('hud-slope');
    this.profilePanel = document.getElementById('profile-panel');
    this.canvas = document.getElementById('profile-canvas');
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.currentProfileData = null;

    // 마우스 호버 인터랙티브 툴팁 및 통계 요소
    this.tooltipEl = document.getElementById('profile-tooltip');
    this.ttElev = document.getElementById('tt-elev');
    this.ttDist = document.getElementById('tt-dist');
    this.ttType = document.getElementById('tt-type');
    this.statHoverGroup = document.getElementById('stat-hover-group');
    this.statHoverElev = document.getElementById('stat-hover-elev');
    this.statHoverDist = document.getElementById('stat-hover-dist');

    // 3D 지도 실시간 연동 콜백
    this.onProfileHover = null;
    this.onProfileLeave = null;
    this.onProfileClick = null;

    this.initCanvasResize();
    this.initCanvasEvents();
  }

  initCanvasResize() {
    if (!this.canvas) return;
    const resize = () => {
      const rect = this.canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      this.canvas.width = rect.width * dpr;
      this.canvas.height = rect.height * dpr;
      if (this.currentProfileData) {
        this.renderProfileChart(this.currentProfileData);
      }
    };
    window.addEventListener('resize', resize);
    setTimeout(resize, 100);
  }

  initCanvasEvents() {
    if (!this.canvas) return;

    // 데스크톱 마우스 호버
    this.canvas.addEventListener('mousemove', (e) => {
      this.handleCanvasHover(e);
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.handleCanvasLeave();
    });

    // 클릭 시 해당 지점으로 3D 카메라 이동
    this.canvas.addEventListener('click', (e) => {
      if (!this.currentProfileData) return;
      const hoverData = this.getHoverDataFromEvent(e);
      if (hoverData && this.onProfileClick) {
        this.onProfileClick(hoverData);
      }
    });

    // 모바일/태블릿 터치 인터랙션
    this.canvas.addEventListener('touchstart', (e) => {
      if (e.touches && e.touches.length > 0) {
        this.handleCanvasHover(e.touches[0]);
      }
    }, { passive: true });

    this.canvas.addEventListener('touchmove', (e) => {
      if (e.touches && e.touches.length > 0) {
        this.handleCanvasHover(e.touches[0]);
      }
    }, { passive: true });

    this.canvas.addEventListener('touchend', () => {
      this.handleCanvasLeave();
    });
  }

  getHoverDataFromEvent(e) {
    if (!this.currentProfileData || !this.canvas) return null;
    const samples = this.currentProfileData.samples;
    if (!samples || samples.length < 2) return null;

    const rect = this.canvas.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    const dpr = window.devicePixelRatio || 1;
    const padding = {
      top: 22 * dpr,
      bottom: 28 * dpr,
      left: 48 * dpr,
      right: 28 * dpr
    };
    const chartW = this.canvas.width - padding.left - padding.right;
    const chartH = this.canvas.height - padding.top - padding.bottom;

    const mouseCanvasX = clientX * dpr;

    // 차트 유효 가로 범위 확인
    if (mouseCanvasX < padding.left || mouseCanvasX > this.canvas.width - padding.right) {
      return null;
    }

    const t = Math.max(0, Math.min(1, (mouseCanvasX - padding.left) / chartW));
    const sampleFloat = t * (samples.length - 1);
    const i0 = Math.floor(sampleFloat);
    const i1 = Math.min(samples.length - 1, i0 + 1);
    const frac = sampleFloat - i0;

    // 고도 및 거리 보간
    const elev0 = samples[i0].elevation;
    const elev1 = samples[i1].elevation;
    const interpolatedElev = Math.round(elev0 + (elev1 - elev0) * frac);

    const dist0 = samples[i0].distance;
    const dist1 = samples[i1].distance;
    const interpolatedDist = Number((dist0 + (dist1 - dist0) * frac).toFixed(2));

    const lng = samples[i0].lng + (samples[i1].lng - samples[i0].lng) * frac;
    const lat = samples[i0].lat + (samples[i1].lat - samples[i0].lat) * frac;

    // Y축 고도 스케일 계산
    const elevations = samples.map(s => s.elevation);
    let maxE = Math.max(...elevations);
    let minE = Math.min(...elevations);
    const range = Math.max(maxE - minE, 50);
    maxE = Math.ceil((maxE + range * 0.1) / 50) * 50;
    minE = Math.max(0, Math.floor((minE - range * 0.1) / 50) * 50);

    const elevRatio = (interpolatedElev - minE) / (maxE - minE);
    const curveCanvasY = padding.top + chartH - (elevRatio * chartH);

    return {
      canvasX: mouseCanvasX,
      canvasY: curveCanvasY,
      clientX: clientX,
      clientY: curveCanvasY / dpr,
      elevation: interpolatedElev,
      distance: interpolatedDist,
      lng: lng,
      lat: lat
    };
  }

  handleCanvasHover(e) {
    const hoverData = this.getHoverDataFromEvent(e);
    if (!hoverData) {
      this.handleCanvasLeave();
      return;
    }

    // 1. 차트 캔버스에 가이드선 및 파란색 선 위 하이라이트 핀 렌더링
    this.renderProfileChart(this.currentProfileData, hoverData);

    // 2. 세련된 플로팅 툴팁 및 상단 헤더 통계 업데이트
    this.updateHoverTooltip(hoverData);

    // 3. 3D 지도에 동기화 마커 표시
    if (this.onProfileHover) {
      this.onProfileHover(hoverData);
    }
  }

  updateHoverTooltip(hoverData) {
    if (!this.tooltipEl || !this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();

    if (this.ttElev) {
      this.ttElev.textContent = hoverData.elevation.toLocaleString();
    }
    if (this.ttDist) {
      this.ttDist.textContent = hoverData.distance;
    }
    if (this.ttType) {
      let desc = "평지 / 구릉";
      if (hoverData.elevation > 1400) desc = "고산 암릉 지대";
      else if (hoverData.elevation > 900) desc = "가파른 산악";
      else if (hoverData.elevation > 400) desc = "중간 산지";
      this.ttType.textContent = desc;
    }

    // 툴팁 위치 계산 (좌우 경계 안전 클램핑)
    const clampX = Math.max(80, Math.min(rect.width - 80, hoverData.clientX));
    this.tooltipEl.style.left = `${clampX}px`;

    // 파란색 선이 캔버스 상단에 가까우면 툴팁을 선 아래로 표시
    if (hoverData.clientY < 60) {
      this.tooltipEl.style.top = `${hoverData.clientY}px`;
      this.tooltipEl.style.transform = 'translate(-50%, 15px)';
    } else {
      this.tooltipEl.style.top = `${hoverData.clientY}px`;
      this.tooltipEl.style.transform = 'translate(-50%, -100%) translateY(-14px)';
    }

    this.tooltipEl.classList.add('show');

    // 패널 상단 요약 바 실시간 선택 위치 표시
    if (this.statHoverGroup) {
      this.statHoverGroup.style.display = 'inline-flex';
      if (this.statHoverElev) {
        this.statHoverElev.textContent = `${hoverData.elevation.toLocaleString()} m`;
      }
      if (this.statHoverDist) {
        this.statHoverDist.textContent = `${hoverData.distance} km`;
      }
    }
  }

  handleCanvasLeave() {
    if (this.tooltipEl) {
      this.tooltipEl.classList.remove('show');
    }
    if (this.statHoverGroup) {
      this.statHoverGroup.style.display = 'none';
    }
    if (this.currentProfileData) {
      this.renderProfileChart(this.currentProfileData, null);
    }
    if (this.onProfileLeave) {
      this.onProfileLeave();
    }
  }

  updateHUD({ lng, lat, elevation }) {
    if (this.hudElevation) {
      this.hudElevation.innerHTML = `${elevation.toLocaleString()} <span class="unit">m</span>`;
    }
    if (this.hudCoords) {
      this.hudCoords.textContent = `${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E`;
    }
    if (this.hudSlope) {
      let desc = "평지/완경사";
      if (elevation > 1400) desc = "고산 암릉 지대";
      else if (elevation > 900) desc = "가파른 산악";
      else if (elevation > 400) desc = "중간 산지";
      else if (elevation <= 5) desc = "해안/저지대";
      this.hudSlope.textContent = desc;
    }
  }

  showProfile(profileData) {
    this.currentProfileData = profileData;
    if (!this.profilePanel) return;

    this.profilePanel.classList.add('show');

    // 통계 계산
    const samples = profileData.samples;
    const elevations = samples.map(s => s.elevation);
    const maxElev = Math.max(...elevations);
    const minElev = Math.min(...elevations);

    let gain = 0;
    for (let i = 1; i < elevations.length; i++) {
      const diff = elevations[i] - elevations[i - 1];
      if (diff > 0) gain += diff;
    }

    document.getElementById('stat-dist').textContent = `${profileData.distanceKm} km`;
    document.getElementById('stat-max').textContent = `${maxElev} m`;
    document.getElementById('stat-min').textContent = `${minElev} m`;
    document.getElementById('stat-gain').textContent = `+${gain} m`;

    if (this.statHoverGroup) {
      this.statHoverGroup.style.display = 'none';
    }

    this.renderProfileChart(profileData);
  }

  hideProfile() {
    this.handleCanvasLeave();
    if (this.profilePanel) {
      this.profilePanel.classList.remove('show');
    }
    this.currentProfileData = null;
  }

  renderProfileChart(profileData, hoverData = null) {
    if (!this.canvas) return;
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const samples = profileData.samples;
    if (samples.length < 2) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, w, h);

    const padding = {
      top: 22 * dpr,
      bottom: 28 * dpr,
      left: 48 * dpr,
      right: 28 * dpr
    };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;

    const elevations = samples.map(s => s.elevation);
    let maxE = Math.max(...elevations);
    let minE = Math.min(...elevations);

    // 축 상하 여유 마진
    const range = Math.max(maxE - minE, 50);
    maxE = Math.ceil((maxE + range * 0.1) / 50) * 50;
    minE = Math.max(0, Math.floor((minE - range * 0.1) / 50) * 50);

    // 1. 격자선 및 Y축 눈금 레이블
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
    ctx.lineWidth = 1 * dpr;
    ctx.fillStyle = '#64748b';
    ctx.font = `${10 * dpr}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.textAlign = 'right';

    const yTicks = 4;
    for (let i = 0; i <= yTicks; i++) {
      const elevVal = Math.round(minE + ((maxE - minE) / yTicks) * i);
      const y = padding.top + chartH - (i / yTicks) * chartH;

      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(w - padding.right, y);
      ctx.stroke();

      ctx.fillText(`${elevVal}m`, padding.left - 8 * dpr, y + 4 * dpr);
    }

    // 2. X축 시작(0km)과 끝(총거리) 레이블
    ctx.textAlign = 'center';
    ctx.fillText('0km', padding.left, h - 8 * dpr);
    ctx.fillText(`${profileData.distanceKm}km`, w - padding.right, h - 8 * dpr);

    // 좌표 매핑 헬퍼
    const getX = (idx) => padding.left + (idx / (samples.length - 1)) * chartW;
    const getY = (elev) => padding.top + chartH - ((elev - minE) / (maxE - minE)) * chartH;

    // 3. 고도 면 영역 채우기 (네온 시안 그라디언트)
    const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartH);
    gradient.addColorStop(0, 'rgba(6, 182, 212, 0.45)');
    gradient.addColorStop(1, 'rgba(6, 182, 212, 0.02)');

    ctx.beginPath();
    ctx.moveTo(getX(0), padding.top + chartH);

    for (let i = 0; i < samples.length; i++) {
      const x = getX(i);
      const y = getY(samples[i].elevation);
      if (i === 0) {
        ctx.lineTo(x, y);
      } else {
        const prevX = getX(i - 1);
        const prevY = getY(samples[i - 1].elevation);
        const cx = (prevX + x) / 2;
        ctx.bezierCurveTo(cx, prevY, cx, y, x, y);
      }
    }

    ctx.lineTo(getX(samples.length - 1), padding.top + chartH);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // 4. 상단 고도 실선 (파란색 메인 라인 + 네온 글로우)
    ctx.save();
    ctx.beginPath();
    for (let i = 0; i < samples.length; i++) {
      const x = getX(i);
      const y = getY(samples[i].elevation);
      if (i === 0) ctx.moveTo(x, y);
      else {
        const prevX = getX(i - 1);
        const prevY = getY(samples[i - 1].elevation);
        const cx = (prevX + x) / 2;
        ctx.bezierCurveTo(cx, prevY, cx, y, x, y);
      }
    }
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.8 * dpr;
    ctx.shadowColor = 'rgba(56, 189, 248, 0.55)';
    ctx.shadowBlur = 8 * dpr;
    ctx.stroke();
    ctx.restore();

    // 5. 최고점 포인트 강조 (빨간 핀)
    let maxIdx = 0;
    elevations.forEach((e, idx) => {
      if (e > elevations[maxIdx]) maxIdx = idx;
    });

    const peakX = getX(maxIdx);
    const peakY = getY(elevations[maxIdx]);

    ctx.beginPath();
    ctx.arc(peakX, peakY, 4.5 * dpr, 0, Math.PI * 2);
    ctx.fillStyle = '#f43f5e';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5 * dpr;
    ctx.stroke();

    // 6. 마우스 호버 시 인터랙티브 가이드라인 & 파란색 선 위 하이라이트 핀 렌더링
    if (hoverData) {
      ctx.save();

      // 수직 점선 가이드
      ctx.setLineDash([4 * dpr, 3 * dpr]);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
      ctx.lineWidth = 1.5 * dpr;
      ctx.beginPath();
      ctx.moveTo(hoverData.canvasX, padding.top);
      ctx.lineTo(hoverData.canvasX, padding.top + chartH);
      ctx.stroke();

      // 수평 Y축 가이드선
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
      ctx.beginPath();
      ctx.moveTo(padding.left, hoverData.canvasY);
      ctx.lineTo(hoverData.canvasX, hoverData.canvasY);
      ctx.stroke();
      ctx.restore();

      // 파란색 선 위 하이라이트 타겟 핀 (3단 글로우)
      // 1) 외곽 은은한 아우라
      ctx.beginPath();
      ctx.arc(hoverData.canvasX, hoverData.canvasY, 11 * dpr, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(6, 182, 212, 0.28)';
      ctx.fill();

      // 2) 네온 블루 링
      ctx.beginPath();
      ctx.arc(hoverData.canvasX, hoverData.canvasY, 6.5 * dpr, 0, Math.PI * 2);
      ctx.fillStyle = '#0284c7';
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2 * dpr;
      ctx.fill();
      ctx.stroke();

      // 3) 중심 화이트 코어
      ctx.beginPath();
      ctx.arc(hoverData.canvasX, hoverData.canvasY, 3.5 * dpr, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();

      // Y축에 현재 고도 하이라이트 배지
      ctx.save();
      const tagText = `${hoverData.elevation}m`;
      ctx.font = `bold ${10 * dpr}px -apple-system, sans-serif`;
      const textMetrics = ctx.measureText(tagText);
      const tagW = textMetrics.width + 10 * dpr;
      const tagH = 16 * dpr;
      const tagX = padding.left - tagW - 4 * dpr;
      const tagY = hoverData.canvasY - tagH / 2;

      ctx.fillStyle = '#0284c7';
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(tagX, tagY, tagW, tagH, 4 * dpr);
      } else {
        ctx.rect(tagX, tagY, tagW, tagH);
      }
      ctx.fill();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1 * dpr;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(tagText, tagX + tagW / 2, tagY + tagH - 4 * dpr);
      ctx.restore();
    }
  }
}
