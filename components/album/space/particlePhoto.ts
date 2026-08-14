import * as THREE from 'three'

/** 相册城市数据（与 /api/album 返回结构一致） */
export interface CityData {
  name: string
  province: string
  provinceId: string
  images: string[]
  date: string
  postSlug: string
}

export interface PhotoAtlas {
  texture: THREE.CanvasTexture
  gridN: number
}

const ATLAS_CELL = 64
const MAX_CELLS = 25 // 5x5，单张唱片最多 25 张照片（v1 上限）

/**
 * 将照片列表烘焙为一张图集纹理（每张照片占一个格子），
 * 着色器按 UV 采样取色，避免逐张上传纹理。
 */
export async function buildPhotoAtlas(images: string[]): Promise<PhotoAtlas | null> {
  const list = images.slice(0, MAX_CELLS)
  if (list.length === 0) return null
  const n = Math.ceil(Math.sqrt(list.length))
  const size = n * ATLAS_CELL
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = '#101018'
  ctx.fillRect(0, 0, size, size)

  await Promise.all(
    list.map(
      (src, i) =>
        new Promise<void>((resolve) => {
          const img = new Image()
          img.crossOrigin = 'anonymous'
          img.onload = () => {
            try {
              const cx = (i % n) * ATLAS_CELL
              const cy = Math.floor(i / n) * ATLAS_CELL
              const scale = Math.max(ATLAS_CELL / img.width, ATLAS_CELL / img.height)
              const w = img.width * scale
              const h = img.height * scale
              ctx.drawImage(img, cx + (ATLAS_CELL - w) / 2, cy + (ATLAS_CELL - h) / 2, w, h)
            } catch {
              // 单张失败不影响整体
            }
            resolve()
          }
          img.onerror = () => resolve()
          img.src = src
        })
    )
  )

  const texture = new THREE.CanvasTexture(canvas)
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true
  return { texture, gridN: n }
}

/** 软圆点纹理（粒子形状） */
let dotTexture: THREE.CanvasTexture | null = null
export function getDotTexture(): THREE.CanvasTexture {
  if (dotTexture) return dotTexture
  const cv = document.createElement('canvas')
  cv.width = cv.height = 64
  const ctx = cv.getContext('2d')!
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 31)
  g.addColorStop(0, 'rgba(255,255,255,0.98)')
  g.addColorStop(0.42, 'rgba(255,255,255,0.8)')
  g.addColorStop(0.72, 'rgba(255,255,255,0.22)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 64)
  dotTexture = new THREE.CanvasTexture(cv)
  return dotTexture
}

// 分区粒子数量
const COVER_COUNT = 900 // 中心封面
const RING_COUNT = 2400 // 照片环
const GROOVE_COUNT = 700 // 黑胶槽纹
const RIM_COUNT = 320 // 白色 rim

/** 生成一张唱片的所有粒子属性 */
export function buildRecordGeometry(atlas: PhotoAtlas): THREE.BufferGeometry {
  const total = COVER_COUNT + RING_COUNT + GROOVE_COUNT + RIM_COUNT
  const positions = new Float32Array(total * 3)
  const zones = new Float32Array(total)
  const photoIdx = new Float32Array(total)
  const uvs = new Float32Array(total * 2)
  const rands = new Float32Array(total)
  const edges = new Float32Array(total)

  const cells = atlas.gridN * atlas.gridN
  let i = 0
  const push = (zone: number, pIdx: number, u: number, v: number, rand: number, edge: number) => {
    zones[i] = zone
    photoIdx[i] = pIdx
    uvs[i * 2] = u
    uvs[i * 2 + 1] = v
    rands[i] = rand
    edges[i] = edge
    i++
  }

  for (let k = 0; k < COVER_COUNT; k++) {
    const u = Math.random()
    const r = Math.random()
    push(0, 0, u, r, Math.random(), r > 0.94 ? 1 : 0)
  }
  for (let k = 0; k < RING_COUNT; k++) {
    const pIdx = Math.floor(Math.random() * cells)
    const u = Math.random()
    const v = Math.random()
    push(1, pIdx, u, v, Math.random(), v > 0.94 ? 1 : 0)
  }
  for (let k = 0; k < GROOVE_COUNT; k++) {
    push(2, 0, Math.random(), Math.random(), Math.random(), 0)
  }
  for (let k = 0; k < RIM_COUNT; k++) {
    push(3, 0, Math.random(), 0, Math.random(), 1)
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('aZone', new THREE.BufferAttribute(zones, 1))
  geo.setAttribute('aPhotoIndex', new THREE.BufferAttribute(photoIdx, 1))
  geo.setAttribute('aUv', new THREE.BufferAttribute(uvs, 2))
  geo.setAttribute('aRand', new THREE.BufferAttribute(rands, 1))
  geo.setAttribute('aEdge', new THREE.BufferAttribute(edges, 1))
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 4)
  return geo
}

const RECORD_VERTEX = /* glsl */ `
attribute float aZone;
attribute float aPhotoIndex;
attribute vec2  aUv;
attribute float aRand;
attribute float aEdge;

uniform float uTime;
uniform float uProgress;   // 0=散落 1=聚合为唱片
uniform float uHover;
uniform float uOpacity;
uniform float uVinylSpin;  // 自转弧度（360° 无级）
uniform float uCoverR;
uniform float uRimR;
uniform float uPixel;
uniform float uSize;
uniform float uBloom;
uniform sampler2D uAtlas;
uniform vec2  uAtlasGrid;

varying vec3 vColor;
varying float vAlpha;

float hash11(float p){ return fract(sin(p * 127.1) * 43758.5453123); }

void main(){
  // ---- 聚合态：唱片表面极坐标 ----
  float theta = 0.0;
  float r = 0.0;
  vec2 sampleUv = aUv;
  vec3 col;
  float isPhoto = 0.0;
  float lum = 0.0;

  if (aZone < 0.5) {
    // 中心封面：圆盘采样（aUv.x=角度 aUv.y=半径）
    float rr = sqrt(aUv.y);
    theta = aUv.x * 6.2831853;
    r = rr * uCoverR;
    float cx = cos(theta) * r;
    float cy = sin(theta) * r;
    sampleUv = vec2(cx, cy) / (uCoverR * 2.0) + 0.5;
    isPhoto = 1.0;
  } else if (aZone < 1.5) {
    // 照片环扇区：每张照片一个扇区
    float n = uAtlasGrid.x * uAtlasGrid.y;
    float sector = mod(aPhotoIndex, n);
    theta = (sector + aUv.x) / n * 6.2831853;
    r = mix(uCoverR, uRimR * 0.96, aUv.y);
    sampleUv = aUv;
    isPhoto = 1.0;
  } else if (aZone < 2.5) {
    // 黑胶槽纹
    float ring = floor(aRand * 26.0);
    float rr = (ring + fract(aRand * 26.0)) / 26.0;
    r = uCoverR + rr * (uRimR * 0.98 - uCoverR);
    theta = aRand * 6.2831853;
  } else {
    // 白色 rim
    r = uRimR * 0.995;
    theta = aRand * 6.2831853;
  }
  theta += uVinylSpin;
  vec3 vinyl = vec3(cos(theta) * r, sin(theta) * r, (aRand - 0.5) * 0.5);

  // ---- 散落态：随机球面 ----
  float phi = aRand * 6.2831853;
  float th  = acos(1.0 - 2.0 * fract(aRand * 7.13));
  float R   = 2.8 + fract(aRand * 3.7) * 3.2;
  vec3 scatter = R * vec3(sin(th) * cos(phi), sin(th) * sin(phi), cos(th));

  float p = smoothstep(0.0, 1.0, uProgress);
  vec3 pos = mix(scatter, vinyl, p);

  // 悬停呼吸 + 边缘粒子向外飘散
  float breath = sin(uTime * 2.2 + aRand * 6.28) * 0.05;
  pos += vinyl * breath * uHover;
  pos.z += aEdge * uHover * (0.12 + fract(aRand * 9.1) * 0.3) * (1.0 - p);

  // ---- 颜色 ----
  if (aZone < 1.5) {
    vec2 cell = vec2(mod(aPhotoIndex, uAtlasGrid.x), floor(aPhotoIndex / uAtlasGrid.x));
    vec2 atlasUv = (cell + sampleUv) / uAtlasGrid;
    col = texture2D(uAtlas, atlasUv).rgb;
    lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = col * (0.82 + 0.18 * lum);
    // 照片环最外圈加一点白边（唱片质感）
    if (aZone >= 0.5 && aUv.y > 0.93) col = mix(col, vec3(1.0), 0.35);
  } else if (aZone < 2.5) {
    col = vec3(0.040, 0.042, 0.055) * (0.8 + 0.5 * hash11(aRand));
    // 反光扫过
    float sheen = sin(theta * 3.0 + uVinylSpin * 6.0 + aRand * 7.0);
    col += vec3(0.05, 0.06, 0.08) * smoothstep(0.82, 1.0, sheen);
  } else {
    col = vec3(0.86, 0.9, 0.97);
  }

  float alpha = (0.4 + 0.6 * p) * uOpacity;
  alpha += uHover * 0.15;
  vColor = col;
  vAlpha = alpha;

  // ---- 点大小（亮度驱动 + 深度衰减）----
  float base = 1.0;
  if (isPhoto > 0.5) base = 0.95 + lum * 1.9;
  else if (aZone > 2.5) base = 1.5;
  else base = 1.1;

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  float depthSize = 140.0 / max(0.5, -mv.z);
  float size = base * uSize * (1.0 + uBloom * 0.5) * depthSize;
  gl_PointSize = clamp(size * uPixel, 0.8, uBloom > 0.5 ? 9.0 : 5.5);
  gl_Position = projectionMatrix * mv;
}
`

const RECORD_FRAGMENT = /* glsl */ `
precision highp float;
uniform sampler2D uDot;
uniform float uBloom;
varying vec3 vColor;
varying float vAlpha;
void main(){
  vec4 tex = texture2D(uDot, gl_PointCoord);
  if (tex.a < 0.02) discard;
  float a = tex.a;
  if (uBloom > 0.5) a = a * a;
  gl_FragColor = vec4(vColor * (uBloom > 0.5 ? 1.15 : 1.0), a * vAlpha * (uBloom > 0.5 ? 0.55 : 1.0));
}
`

export interface RecordUniforms {
  uProgress: { value: number }
  uHover: { value: number }
  uOpacity: { value: number }
  uVinylSpin: { value: number }
}

export function createRecordMaterial(
  atlas: PhotoAtlas,
  isBloom: boolean,
  sharedTime: { value: number }
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: sharedTime,
      uProgress: { value: 0.35 },
      uHover: { value: 0 },
      uOpacity: { value: 0.4 },
      uVinylSpin: { value: 0 },
      uCoverR: { value: 0.55 },
      uRimR: { value: 1.6 },
      uPixel: { value: 1 },
      uSize: { value: isBloom ? 1.35 : 1.0 },
      uBloom: { value: isBloom ? 1 : 0 },
      uAtlas: { value: atlas.texture },
      uAtlasGrid: { value: new THREE.Vector2(atlas.gridN, atlas.gridN) },
      uDot: { value: getDotTexture() },
    },
    vertexShader: RECORD_VERTEX,
    fragmentShader: RECORD_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: isBloom ? THREE.AdditiveBlending : THREE.NormalBlending,
  })
}

export function disposeAtlas(atlas: PhotoAtlas | null) {
  if (atlas) atlas.texture.dispose()
}
