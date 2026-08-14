import * as THREE from 'three'
import type { CityData, PhotoAtlas } from './particlePhoto'
import { buildRecordGeometry, createRecordMaterial, type RecordUniforms } from './particlePhoto'

export interface VinylRecord {
  index: number
  city: CityData
  group: THREE.Group
  points: THREE.Points
  bloomPoints: THREE.Points
  /** 轨道方位角 */
  theta: number
  baseY: number
  /** 动画状态 */
  progress: number
  progressTarget: number
  hover: number
  hoverTarget: number
  opacity: number
  opacityTarget: number
  spin: number
  autoSpin: number
  spinVel: number
  dispose: () => void
}

export interface VinylRecordOptions {
  index: number
  count: number
  radius: number
  city: CityData
  atlas: PhotoAtlas
  sharedTime: { value: number }
}

/**
 * 构建一个城市的粒子黑胶唱片：
 * - 位置：环形轨道（index/count 均匀分布），高度正弦错开
 * - 朝向：lookAt 圆心（唱片正面朝相机/圆心）
 * - 双粒子层：主粒子（Normal）+ bloom 粒子（Additive）
 */
export function createVinylRecord(opts: VinylRecordOptions): VinylRecord {
  const { index, count, radius, city, atlas, sharedTime } = opts

  const theta = (index / Math.max(1, count)) * Math.PI * 2 - Math.PI / 2
  const baseY = Math.sin(theta * 2.0 + 1.7) * 1.8

  const geometry = buildRecordGeometry(atlas)
  const material = createRecordMaterial(atlas, false, sharedTime)
  const bloomMaterial = createRecordMaterial(atlas, true, sharedTime)

  const points = new THREE.Points(geometry, material)
  points.renderOrder = 1
  points.frustumCulled = false

  const bloomPoints = new THREE.Points(geometry, bloomMaterial)
  bloomPoints.renderOrder = 0
  bloomPoints.frustumCulled = false

  const group = new THREE.Group()
  group.position.set(Math.cos(theta) * radius, baseY, Math.sin(theta) * radius)
  group.add(bloomPoints)
  group.add(points)
  group.lookAt(0, baseY, 0)

  const record: VinylRecord = {
    index,
    city,
    group,
    points,
    bloomPoints,
    theta,
    baseY,
    progress: 0.35,
    progressTarget: 0.35,
    hover: 0,
    hoverTarget: 0,
    opacity: 0.4,
    opacityTarget: 0.4,
    spin: Math.random() * Math.PI * 2,
    autoSpin: 0.06 + Math.random() * 0.05,
    spinVel: 0,
    dispose: () => {
      geometry.dispose()
      material.dispose()
      bloomMaterial.dispose()
    },
  }

  updateVinylRecordUniforms(record)

  return record
}

/** 记录同步每帧动画值到 uniform */
export function updateVinylRecordUniforms(record: VinylRecord) {
  const materials = [record.points.material, record.bloomPoints.material] as THREE.ShaderMaterial[]
  for (const m of materials) {
    const u = m.uniforms as unknown as RecordUniforms
    u.uProgress.value = record.progress
    u.uHover.value = record.hover
    u.uOpacity.value = record.opacity
    u.uVinylSpin.value = record.spin
  }
}
