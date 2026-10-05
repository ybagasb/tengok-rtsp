import type { StyleSpecification } from 'maplibre-gl';

/**
 * Map styles.
 *
 * - Dark / Light: MapTiler vector styles (fast global CDN, incl. Asia) when
 *   NEXT_PUBLIC_MAPTILER_KEY is set. Falls back to OpenFreeMap (keyless, but
 *   slower from some regions) so the map never goes blank if the key is missing.
 * - Satellite: ESRI World Imagery raster (free, no key).
 *
 * MapLibre's `mapStyle` prop accepts either a style URL (string) or an inline
 * StyleSpecification.
 */

export type MapStyleId = 'dark' | 'light' | 'satellite';

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;
const ESRI_ATTRIBUTION = 'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics';

// MapTiler style URLs (used when a key is present).
const maptiler = (style: string) =>
    `https://api.maptiler.com/maps/${style}/style.json?key=${MAPTILER_KEY}`;

// Keyless fallback (OpenFreeMap) if no MapTiler key is configured.
const OPENFREEMAP_DARK = 'https://tiles.openfreemap.org/styles/dark';
const OPENFREEMAP_LIGHT = 'https://tiles.openfreemap.org/styles/positron';

const DARK = MAPTILER_KEY ? maptiler('streets-v2-dark') : OPENFREEMAP_DARK;
const LIGHT = MAPTILER_KEY ? maptiler('streets-v2-light') : OPENFREEMAP_LIGHT;

// ESRI World Imagery satellite as an inline raster style (no key required).
const SATELLITE: StyleSpecification = {
    version: 8,
    sources: {
        'esri-satellite': {
            type: 'raster',
            tiles: [
                'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            ],
            tileSize: 256,
            // ESRI does NOT return 404 for out-of-range tiles — it returns a
            // "Map data not yet available" image (HTTP 200), so MapLibre can't
            // detect them as missing and overzoom. In many regions (incl. parts
            // of Indonesia) real imagery stops around z17. So we cap the source
            // at z17: MapLibre then OVERZOOMS from z17 (stretches that tile) for
            // closer views instead of ever requesting the "not available" tiles.
            maxzoom: 17,
            attribution: ESRI_ATTRIBUTION,
        },
    },
    layers: [
        { id: 'bg', type: 'background', paint: { 'background-color': '#0b1220' } },
        { id: 'esri-satellite', type: 'raster', source: 'esri-satellite' },
    ],
};

// `mapStyle` accepts a URL string OR an inline StyleSpecification.
export const MAP_STYLES: Record<MapStyleId, string | StyleSpecification> = {
    dark: DARK,
    light: LIGHT,
    satellite: SATELLITE,
};

export const MAP_STYLE_META: { id: MapStyleId; label: string }[] = [
    { id: 'dark', label: 'Gelap' },
    { id: 'light', label: 'Terang' },
    { id: 'satellite', label: 'Satelit' },
];
