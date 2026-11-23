/**
 * ⚠️ F1（2026-11-23）起**客户端不再 import 本模块**。
 *
 * 地图几何（投影后的 path / 质心 / 包围盒 / 城市点位）已改为构建期预计算：
 *   · 生成脚本：scripts/gen-map-artifact.mjs（npm run map:artifact）
 *   · 客户端入口：lib/map-artifact.ts + public/map/china-paths.v1.json
 * 本文件保留为「投影/裁剪逻辑的参考实现」（与生成脚本逐项一致），并被
 * scripts/gen-map-artifact.mjs 的注释引用。任何客户端组件重新 import 它，
 * 都会把 d3-geo + 582KB 的 data/china-geo.json 重新拖回客户端 bundle —— 不要这么做。
 */
import { geoArea, geoMercator, geoPath, type GeoProjection } from "d3-geo";
import rawChina from "@/data/china-geo.json";
import { provinces } from "@/data/provinces";

type Position = [number, number];
type Ring = Position[];

export interface GeoFeature {
  type: "Feature";
  properties: { adcode: number; name: string };
  geometry:
    | { type: "Polygon"; coordinates: Ring[] }
    | { type: "MultiPolygon"; coordinates: Ring[][] }
    | { type: string; coordinates: unknown };
}

const adcodeToProvinceId = new Map(
  provinces.map((p) => [p.adcode, p.id] as const)
);

function fixWinding(feature: GeoFeature): GeoFeature {
  if (geoArea(feature as never) <= 2 * Math.PI) return feature;
  const geom = feature.geometry as
    | { type: "Polygon"; coordinates: Ring[] }
    | { type: "MultiPolygon"; coordinates: Ring[][] };
  if (geom.type === "Polygon") {
    geom.coordinates = geom.coordinates.map((ring, i) =>
      i === 0 ? ring.slice().reverse() : ring.slice()
    );
  } else if (geom.type === "MultiPolygon") {
    geom.coordinates = geom.coordinates.map((poly) =>
      poly.map((ring, i) => (i === 0 ? ring.slice().reverse() : ring.slice()))
    );
  }
  return feature;
}

export const chinaFeatures: GeoFeature[] = (
  rawChina.features as GeoFeature[]
).filter(
  (f) =>
    adcodeToProvinceId.has(f.properties.adcode) &&
    (f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon")
).map(fixWinding);

const rawDashLine = (rawChina.features as GeoFeature[]).find(
  (f) => String(f.properties.adcode) === "100000_JD"
);
export const dashLineFeature: GeoFeature | null = rawDashLine
  ? fixWinding(rawDashLine)
  : null;

export const provinceIdOf = (feature: GeoFeature): string =>
  adcodeToProvinceId.get(feature.properties.adcode) ?? "";

export function makeProjection(
  width: number,
  height: number,
  padding = 24
): GeoProjection {
  return geoMercator().fitExtent(
    [
      [padding, padding],
      [width - padding, height - padding],
    ],
    { type: "FeatureCollection", features: chinaFeatures } as never
  );
}

export function makePath(projection: GeoProjection) {
  return geoPath(projection);
}
