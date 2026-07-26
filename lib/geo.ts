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
