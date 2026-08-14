import * as THREE from 'three'

/**
 * 360° 银河背景：
 * - 球壳星云：SphereGeometry 内表面 + FBM 噪声 ShaderMaterial，随相机任何角度都被包裹
 * - 环绕星点：Mineradio backgroundStarRiver 思路改写，粒子分布在相机四周大球壳上
 */

const NEBULA_VERTEX = /* glsl */ `
varying vec3 vWorldPos;
void main(){
  vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const NEBULA_FRAGMENT = /* glsl */ `
precision highp float;
varying vec3 vWorldPos;
uniform float uTime;

float hash(vec3 p){
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise(vec3 x){
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
        mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
        mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
    f.z);
}
float fbm(vec3 p){
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    v += a * noise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return v;
}

void main(){
  vec3 dir = normalize(vWorldPos - cameraPosition);
  float n1 = fbm(dir * 2.1 + vec3(0.0, uTime * 0.010, uTime * 0.006));
  float n2 = fbm(dir * 4.2 - vec3(uTime * 0.007, 0.0, 0.0) + 5.0);
  // 旋臂感：方位角 + 高度 + 噪声扰动
  float ang = atan(dir.x, dir.z);
  float arm = sin(ang * 3.0 + dir.y * 4.5 + n1 * 2.2);

  vec3 col = vec3(0.014, 0.014, 0.028);
  col += vec3(0.055, 0.032, 0.12) * smoothstep(0.42, 0.8, n1);
  col += vec3(0.018, 0.065, 0.12) * smoothstep(0.5, 0.85, n2);
  col += vec3(0.10, 0.055, 0.02) * smoothstep(0.55, 0.92, arm * arm * n1);
  gl_FragColor = vec4(col, 1.0);
}
`

export function createNebulaSkybox(sharedTime: { value: number }): THREE.Mesh {
  const geo = new THREE.SphereGeometry(180, 16, 12)
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: sharedTime },
    vertexShader: NEBULA_VERTEX,
    fragmentShader: NEBULA_FRAGMENT,
    side: THREE.BackSide,
    depthWrite: false,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.renderOrder = -20
  mesh.frustumCulled = false
  return mesh
}

const STAR_COUNT = 1600

const STAR_VERTEX = /* glsl */ `
attribute float aSeed;
attribute float aLane;
attribute float aDepthSeed;
uniform float uTime;
uniform float uAlpha;
uniform float uPixel;
uniform float uPointScale;
varying vec3 vColor;
varying float vAlpha;

float hash11(float p){ return fract(sin(p * 127.1) * 43758.5453123); }

void main(){
  float band = floor(aLane * 6.0);
  float local = fract(aLane * 6.0);
  float bandN = (band + 0.5) / 6.0;
  float seed = aSeed + band * 19.17;
  float flow = fract(hash11(seed * 2.13) + uTime * (0.0022 + bandN * 0.0028 + hash11(seed * 5.1) * 0.0034));
  float arc = (flow - 0.5) * 6.2831853 * (0.68 + bandN * 0.46) + bandN * 2.4 + hash11(seed) * 6.2831853;
  float wave = sin(arc * (1.18 + bandN * 0.28) + uTime * (0.014 + bandN * 0.012) + seed * 0.07);

  // 大球壳环绕相机（360° 可见）
  float radius = 70.0 + bandN * 60.0 + hash11(seed * 3.7) * 26.0 + local * 8.0;
  vec3 pos;
  pos.x = cos(arc * 0.76 + bandN * 0.84) * radius + (flow - 0.5) * (26.0 + bandN * 18.0);
  pos.y = (bandN - 0.5) * 46.0 + wave * (3.0 + bandN * 3.0) + (local - 0.5) * 4.0;
  pos.z = sin(arc * 0.76 + bandN * 0.84) * radius + (flow - 0.5) * (26.0 + bandN * 18.0);

  float twinkle = pow(0.5 + 0.5 * sin(uTime * (0.22 + hash11(seed * 4.0) * 0.44) + seed * 9.0), 5.0);
  float ridge = exp(-pow((local - (0.42 + hash11(seed * 6.0) * 0.16)) / (0.22 + hash11(seed * 7.0) * 0.10), 2.0));
  float dust = smoothstep(0.20, 0.98, hash11(seed * 8.0 + band));

  vec3 cool = mix(vec3(0.34, 0.76, 1.0), vec3(0.60, 0.44, 1.0), bandN);
  vec3 warm = vec3(1.0, 0.78, 0.58);
  vColor = mix(cool, warm, ridge * 0.35);
  vAlpha = uAlpha * dust * (0.10 + ridge * 0.52 + twinkle * 0.32);

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  float depthSize = 30.0 / max(0.65, -mv.z);
  float size = 1.10 + ridge * 2.4 + twinkle * 2.8;
  gl_PointSize = clamp(size * depthSize * uPixel * uPointScale, 0.7, 5.4);
  gl_Position = projectionMatrix * mv;
}
`

const STAR_FRAGMENT = /* glsl */ `
precision highp float;
uniform sampler2D uDot;
varying vec3 vColor;
varying float vAlpha;
void main(){
  vec4 tex = texture2D(uDot, gl_PointCoord);
  if (tex.a < 0.02) discard;
  vec3 col = clamp(vColor * (0.66 + vAlpha * 1.6), vec3(0.0), vec3(1.45));
  gl_FragColor = vec4(col, tex.a * vAlpha);
}
`

export function createStarField(sharedTime: { value: number }): THREE.Points {
  const geo = new THREE.BufferGeometry()
  const seeds = new Float32Array(STAR_COUNT)
  const lanes = new Float32Array(STAR_COUNT)
  const depths = new Float32Array(STAR_COUNT)
  for (let i = 0; i < STAR_COUNT; i++) {
    seeds[i] = Math.random() * 1000 + i * 0.37
    lanes[i] = Math.random()
    depths[i] = Math.random()
  }
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
  geo.setAttribute('aLane', new THREE.BufferAttribute(lanes, 1))
  geo.setAttribute('aDepthSeed', new THREE.BufferAttribute(depths, 1))

  // 需要 dot 纹理，从 particlePhoto 复用会导致循环依赖，这里直接内联一个
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
  const dot = new THREE.CanvasTexture(cv)

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: sharedTime,
      uAlpha: { value: 0.9 },
      uPixel: { value: 1 },
      uPointScale: { value: 1 },
      uDot: { value: dot },
    },
    vertexShader: STAR_VERTEX,
    fragmentShader: STAR_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const points = new THREE.Points(geo, mat)
  points.renderOrder = -10
  points.frustumCulled = false
  return points
}
