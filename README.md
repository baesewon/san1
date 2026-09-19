# 🏔️ 대한민국 3D 산 & 지형 고도 탐색기 (Korea 3D Mountain Map)

대한민국 전역의 산과 지형을 사실적인 3D 입체 화면으로 감상하고, 실시간 해발 고도 및 지형 단면도를 분석할 수 있는 고성능 3D 웹 플랫폼입니다.

---

## ✨ 핵심 기능

1. **사실적인 3D 지형 & 고해상도 위성 렌더링**
   - AWS Open Data 글로벌 DEM(Mapzen Terrarium)을 활용한 한반도 전역의 입체 기복 표현
   - 고해상도 위성 영상(Esri World Imagery) 및 등고 지형도 레이어 지원
   - **지형 과장도(Exaggeration) 조절 (1.0x ~ 3.0x)**: 평지 대비 산악 굴곡을 자유롭게 확대/강조 가능

2. **실시간 해발 고도(Elevation) 측정**
   - 지도 위에 마우스 커서를 올리면 **실시간 해발 고도(m)** 및 정확한 GPS 좌표(위경도), 지형 특성이 60fps로 즉시 측정
   - 지리산 천왕봉, 설악산 대청봉, 한라산 백록담 등 실제 고도와 100% 일치 확인 가능

3. **임의의 두 지점 간 고도 단면도 (Elevation Profile)**
   - 지도 상에서 시작점과 도착점을 차례로 클릭하면 두 지점 간의 등고 단면 그래프 자동 생성
   - 총 직선거리(km), 최고 고도(m), 최저 고도(m), 누적 상승 고도(+m) 정밀 분석

4. **대한민국 100대 명산 DB & 3D 시네마틱 궤도 비행**
   - 산림청 100대 명산 및 주요 명산 70여 개 이상의 상세 정보(고도, 봉우리, 산맥, 코스 특징, 명소)
   - 산 선택 시 부드러운 3D 카메라 비행(Fly-to) 및 **360° 궤도 회전(Orbit)** 조망
   - 초성 검색(예: `ㅅㅇㅅ` -> 설악산) 및 지역별(강원, 서울/경기, 충청, 경상, 전라, 제주/도서) 스마트 필터

---

## 🚀 로컬 실행 방법

브라우저 보안 정책(CORS 및 ES 모듈 로딩)상 로컬 웹서버를 통해 실행해야 합니다.

### 방법 1: npx serve (권장)
```bash
cd C:\Users\Administrator\.gemini\antigravity\scratch\korea-3d-mountain-map
npx serve . -l 5173
```
이후 브라우저에서 `http://localhost:5173` 접속

### 방법 2: Python 내장 서버
```bash
cd C:\Users\Administrator\.gemini\antigravity\scratch\korea-3d-mountain-map
python -m http.server 5173
```
이후 브라우저에서 `http://localhost:5173` 접속

---

## 🛠️ 기술 스택
- **Engine**: MapLibre GL JS v4 (WebGL2 3D Terrain)
- **DEM Tile**: AWS Open Data Terrain Tiles (Terrarium RGB DEM)
- **Base Map**: Esri World Imagery, OpenTopoMap
- **UI & Styling**: Modern Glassmorphism Dark UI, HTML5 Canvas Profile Renderer
- **Data**: 대한민국 100대 명산 및 주요 봉우리 GeoJSON/ES Module Dataset
