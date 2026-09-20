import L from "leaflet";

/**
 * divIcon builders. Markup is static HTML styled by map.css; the registry
 * mutates only `.map-marker__heading` (rotation) and the `is-pulsing`
 * class, so an icon is built once per marker and never re-rendered.
 */

export type MarkerTone = "venue" | "task" | "dropoff" | "driver" | "delay";

const CAR_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/></svg>';

const CROWN_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14"/></svg>';

/** Heading chevron: points north at 0°, rotated by the registry. */
const HEADING_SVG =
  '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 0.5 L26.5 12 L20 9 L13.5 12 Z" fill="currentColor"/></svg>';

const ICON_SIZE: Record<MarkerTone, [number, number]> = {
  driver: [40, 40],
  venue: [40, 40],
  delay: [32, 32],
  task: [24, 24],
  dropoff: [24, 24]
};

export function markerHtml(tone: MarkerTone): string {
  switch (tone) {
    case "driver":
      return (
        `<div class="map-marker map-marker--driver">` +
        `<span class="map-marker__pulse"></span>` +
        `<span class="map-marker__heading">${HEADING_SVG}</span>` +
        `<span class="map-marker__body">${CAR_SVG}</span>` +
        `</div>`
      );
    case "venue":
      return (
        `<div class="map-marker map-marker--venue">` +
        `<span class="map-marker__pulse"></span>` +
        `<span class="map-marker__body">${CROWN_SVG}</span>` +
        `</div>`
      );
    case "delay":
      return (
        `<div class="map-marker map-marker--delay">` +
        `<span class="map-marker__pulse"></span>` +
        `<span class="map-marker__body">!</span>` +
        `</div>`
      );
    case "dropoff":
      return `<div class="map-marker map-marker--waypoint"><span class="map-marker__body">↓</span></div>`;
    case "task":
    default:
      return `<div class="map-marker map-marker--waypoint"><span class="map-marker__body">↑</span></div>`;
  }
}

export function markerIcon(tone: MarkerTone): L.DivIcon {
  const size = ICON_SIZE[tone];
  return L.divIcon({
    className: "map-marker-wrap",
    html: markerHtml(tone),
    iconSize: size,
    iconAnchor: [size[0] / 2, size[1] / 2],
    popupAnchor: [0, -size[1] / 2]
  });
}

export function popupHtml(label: string, subtitle?: string): string {
  return (
    `<div class="map-popup">` +
    `<p class="map-popup__title">${escapeHtml(label)}</p>` +
    (subtitle ? `<p class="map-popup__sub">${escapeHtml(subtitle)}</p>` : "") +
    `</div>`
  );
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
