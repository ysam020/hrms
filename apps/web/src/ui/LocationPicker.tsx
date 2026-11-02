/**
 * Map for choosing a point: click or drag the pin, search a place, paste a
 * Google Maps link or "lat, lng", or use the device's location.
 *
 * Vector maps from OpenFreeMap (MapLibre) with shop/amenity icons hidden so
 * the map stays plain; place search by Photon (komoot). Neither needs an API
 * key; both are allowed by the CSP in cloudformation/amplify-deploy.yaml and
 * docker/nginx.conf (MapLibre also needs `worker-src blob:`).
 *
 * MapLibre is heavy, so import this through `LocationPicker` in ./location,
 * which loads it on first render.
 */
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import maplibregl, {
  type GeoJSONSource,
  type LngLatLike,
  type Map as MlMap,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useMediaQuery } from "@next/lib/hooks";
import { Button } from "./controls";
import { Icon } from "./Icon";
import { Spinner } from "./Spinner";
import f from "./fields.module.css";
import s from "./LocationPicker.module.css";

export interface LocationValue {
  lat: number;
  lng: number;
  /** Place name or address (or the coordinates when there is none). */
  name: string;
}

export interface LocationPickerProps {
  lat?: number | null;
  lng?: number | null;
  name?: string | null;
  onChange: (v: LocationValue) => void;
  /** Metres; draws the allowed area around the pin. */
  radius?: number;
  disabled?: boolean;
  height?: number;
}

const STYLES = {
  light: "https://tiles.openfreemap.org/styles/liberty",
  dark: "https://tiles.openfreemap.org/styles/dark",
};

// Centre of India, zoomed out, until a point is chosen.
const DEFAULT_VIEW = { center: [78.9629, 20.5937] as LngLatLike, zoom: 4 };
const PICKED_ZOOM = 16;
// Shop/amenity icons and 3D buildings: clutter for choosing an office.
const HIDDEN_LAYERS = /^(poi|building-3d)/;
const SUGGEST_LIMIT = 6;
const DEBOUNCE_MS = 300;

const coords = (lat: number, lng: number) =>
  `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

const valid = (lat: number, lng: number) =>
  Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

/**
 * Coordinates typed or pasted into search: "28.61, 77.20", or a Google Maps
 * URL (the place's own !3d…!4d… beats the viewport's @lat,lng).
 */
export function parseCoordinates(
  text: string,
): { lat: number; lng: number } | null {
  const n = String.raw`(-?\d{1,3}(?:\.\d+)?)`;
  const patterns = [
    new RegExp(String.raw`!3d${n}!4d${n}`),
    new RegExp(String.raw`[?&](?:q|query|ll|destination)=${n},\s*${n}`),
    new RegExp(String.raw`@${n},${n}`),
    new RegExp(String.raw`^\s*${n}\s*[, ]\s*${n}\s*$`),
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const lat = parseFloat(m[1]);
      const lng = parseFloat(m[2]);
      if (valid(lat, lng)) return { lat, lng };
    }
  }
  return null;
}

interface Suggestion extends LocationValue {
  id: string;
  detail: string;
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties?: Partial<
    Record<
      | "name"
      | "housenumber"
      | "street"
      | "district"
      | "city"
      | "state"
      | "country"
      | "osm_type",
      string
    > & { osm_id: number }
  >;
}

/** Photon search, nearest results to `near` first. */
async function suggest(
  query: string,
  near: { lat: number; lng: number },
  signal: AbortSignal,
): Promise<Suggestion[]> {
  const res = await fetch(
    `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=${SUGGEST_LIMIT}&lang=en&lat=${near.lat}&lon=${near.lng}`,
    { signal },
  );
  const data = await res.json();
  return ((data?.features ?? []) as PhotonFeature[]).map((ft, i) => {
    const p = ft.properties ?? {};
    const [lng, lat] = ft.geometry.coordinates;
    const street = [p.housenumber, p.street].filter(Boolean).join(" ");
    const title = p.name || street || p.city || coords(lat, lng);
    const detail = [
      p.name ? street : null,
      p.district,
      p.city !== title ? p.city : null,
      p.state,
      p.country,
    ]
      .filter(Boolean)
      .join(", ");
    return {
      id: `${p.osm_type ?? ""}${p.osm_id ?? i}`,
      lat,
      lng,
      name: title,
      detail,
    };
  });
}

/** A short name for a point, from Photon's reverse lookup. */
async function nameOf(lat: number, lng: number) {
  try {
    const res = await fetch(
      `https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}&lang=en&limit=1`,
    );
    const p = (await res.json())?.features?.[0]?.properties;
    if (!p) return coords(lat, lng);
    const street = [p.housenumber, p.street].filter(Boolean).join(" ");
    return (
      [p.name, street, p.district ?? p.locality, p.city]
        .filter(Boolean)
        .slice(0, 3)
        .join(", ") || coords(lat, lng)
    );
  } catch {
    return coords(lat, lng);
  }
}

/** A circle of `metres` around a point, as a polygon MapLibre can draw. */
function circle(lat: number, lng: number, metres: number) {
  const pts: [number, number][] = [];
  const dLat = metres / 111_320;
  const dLng = metres / (111_320 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * 2 * Math.PI;
    pts.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  return {
    type: "Feature" as const,
    properties: {},
    geometry: { type: "Polygon" as const, coordinates: [pts] },
  };
}

/** A zoom that shows the whole radius with room around it. */
function zoomFor(lat: number, metres: number | undefined, px: number) {
  if (!metres) return PICKED_ZOOM;
  // Metres per pixel at zoom 0 for MapLibre's 512px tiles.
  const base = 78_271.5 * Math.cos((lat * Math.PI) / 180);
  const z = Math.log2((base * px * 0.55) / (2 * metres));
  return Math.min(18, Math.max(12, z));
}

/** Whether the app is showing its dark appearance (explicit or System). */
function useDarkAppearance() {
  const systemDark = useMediaQuery("(prefers-color-scheme: dark)");
  const [chosen, setChosen] = useState(() =>
    document.documentElement.getAttribute("data-appearance"),
  );
  useEffect(() => {
    const root = document.documentElement;
    const mo = new MutationObserver(() =>
      setChosen(root.getAttribute("data-appearance")),
    );
    mo.observe(root, {
      attributes: true,
      attributeFilter: ["data-appearance"],
    });
    return () => mo.disconnect();
  }, []);
  return chosen === "dark" || (chosen !== "light" && systemDark);
}

export default function LocationPicker({
  lat,
  lng,
  name,
  onChange,
  radius,
  disabled = false,
  height = 320,
}: LocationPickerProps) {
  const dark = useDarkAppearance();
  const listId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  // Map handlers are bound once; they read the latest props from here.
  const latest = useRef({ onChange, disabled, lat, lng, radius, height });
  useEffect(() => {
    latest.current = { onChange, disabled, lat, lng, radius, height };
  });

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(-1);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // The place last chosen here, for the caption until the pin moves elsewhere.
  const [picked, setPicked] = useState<LocationValue | null>(null);

  const has = lat != null && lng != null;
  const near = (v: LocationValue | null) =>
    !!v &&
    has &&
    Math.abs(v.lat - lat!) < 1e-5 &&
    Math.abs(v.lng - lng!) < 1e-5;

  /** Draws (or clears) the radius from the latest props. */
  const drawFence = () => {
    const map = mapRef.current;
    const src = map?.getSource("fence") as GeoJSONSource | undefined;
    if (!src) return;
    const { lat: a, lng: b, radius: r } = latest.current;
    src.setData(
      a != null && b != null && r
        ? circle(a, b, r)
        : { type: "FeatureCollection", features: [] },
    );
  };

  // A point chosen on the map: move the pin at once, name it when known.
  const pick = async (pLat: number, pLng: number) => {
    setProblem(null);
    markerRef.current?.setLngLat([pLng, pLat]);
    const n = await nameOf(pLat, pLng);
    setPicked({ lat: pLat, lng: pLng, name: n });
    latest.current.onChange({ lat: pLat, lng: pLng, name: n });
  };

  useEffect(() => {
    if (!boxRef.current) return;
    const map = new maplibregl.Map({
      container: boxRef.current,
      style: dark ? STYLES.dark : STYLES.light,
      center: has ? [lng!, lat!] : DEFAULT_VIEW.center,
      zoom: has ? zoomFor(lat!, radius, height) : DEFAULT_VIEW.zoom,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
    });
    map.touchZoomRotate.disableRotation();
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-left",
    );
    map.on("click", (e) => {
      if (latest.current.disabled) return;
      void pick(e.lngLat.lat, e.lngLat.lng);
    });
    mapRef.current = map;
    // The map can mount inside a Collapse that is still opening.
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(boxRef.current);
    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // Created once; later prop changes are synced by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Each style load (first, and on appearance changes) starts bare: hide the
  // shop/amenity icons and add the radius layers again.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const accent =
      getComputedStyle(document.documentElement)
        .getPropertyValue("--px-accent")
        .trim() || "#2A78D6";
    const onStyle = () => {
      for (const layer of map.getStyle().layers ?? [])
        if (HIDDEN_LAYERS.test(layer.id))
          map.setLayoutProperty(layer.id, "visibility", "none");
      if (!map.getSource("fence"))
        map.addSource("fence", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
      if (!map.getLayer("fence-fill"))
        map.addLayer({
          id: "fence-fill",
          type: "fill",
          source: "fence",
          paint: { "fill-color": accent, "fill-opacity": 0.12 },
        });
      if (!map.getLayer("fence-line"))
        map.addLayer({
          id: "fence-line",
          type: "line",
          source: "fence",
          paint: { "line-color": accent, "line-width": 2 },
        });
      drawFence();
    };
    map.on("style.load", onStyle);
    if (map.isStyleLoaded()) map.setStyle(dark ? STYLES.dark : STYLES.light);
    else if (map.loaded()) onStyle();
    return () => {
      map.off("style.load", onStyle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dark]);

  // Pin follows the props (typed coordinates, search, etc.).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!has) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    const at: [number, number] = [lng!, lat!];
    if (!markerRef.current) {
      const el = document.createElement("div");
      el.className = s.pin;
      el.innerHTML =
        '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 18.5s6.5-5.6 6.5-10.5a6.5 6.5 0 0 0-13 0c0 4.9 6.5 10.5 6.5 10.5Z"/><circle cx="10" cy="8" r="2.4"/></svg>';
      const m = new maplibregl.Marker({
        element: el,
        anchor: "bottom",
        draggable: !disabled,
      })
        .setLngLat(at)
        .addTo(map);
      m.on("drag", () => {
        const p = m.getLngLat();
        latest.current = { ...latest.current, lat: p.lat, lng: p.lng };
        drawFence();
      });
      m.on("dragend", () => {
        const p = m.getLngLat();
        void pick(p.lat, p.lng);
      });
      markerRef.current = m;
    } else {
      markerRef.current.setLngLat(at);
    }
    if (!map.getBounds().contains(at) || map.getZoom() < 12)
      map.jumpTo({
        center: at,
        zoom: zoomFor(lat!, latest.current.radius, latest.current.height),
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng]);

  useEffect(drawFence, [lat, lng, radius]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    markerRef.current?.setDraggable(!disabled);
  }, [disabled, lat, lng]);

  // Suggestions as you type, nearest to what the map shows first.
  const trimmed = query.trim();
  const typedCoords = parseCoordinates(trimmed);
  useEffect(() => {
    if (trimmed.length < 3 || typedCoords || /^https?:/i.test(trimmed)) {
      setResults([]);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    const t = window.setTimeout(() => {
      const c = mapRef.current?.getCenter();
      suggest(
        trimmed,
        c ? { lat: c.lat, lng: c.lng } : { lat: 20.59, lng: 78.96 },
        controller.signal,
      )
        .then((list) => {
          setResults(list);
          setActive(list.length ? 0 : -1);
          setSearching(false);
        })
        .catch((err) => {
          if (err?.name === "AbortError") return;
          setResults([]);
          setSearching(false);
        });
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(t);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimmed]);

  const choose = (v: LocationValue) => {
    setProblem(null);
    setOpen(false);
    setQuery("");
    setResults([]);
    setPicked(v);
    onChange(v);
  };

  const submit = async () => {
    if (!trimmed) return;
    if (typedCoords) {
      const n = await nameOf(typedCoords.lat, typedCoords.lng);
      return choose({ ...typedCoords, name: n });
    }
    if (/maps\.app\.goo\.gl|goo\.gl\/maps/i.test(trimmed))
      return setProblem(
        "Short links can't be read here. Open the link, then copy the full address from the browser bar.",
      );
    if (/^https?:/i.test(trimmed))
      return setProblem("That link has no coordinates in it.");
    const hit = results[active] ?? results[0];
    if (hit) return choose(hit);
    if (!searching)
      setProblem(
        `Couldn't find “${trimmed}”. Try the street or area, or paste a Google Maps link.`,
      );
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && results.length) {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp" && results.length) {
      e.preventDefault();
      setActive((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      void submit();
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
    }
  };

  const useMine = () => {
    if (!navigator.geolocation) {
      setProblem("This browser can't share its location.");
      return;
    }
    setLocating(true);
    setProblem(null);
    navigator.geolocation.getCurrentPosition(
      async (p) => {
        await pick(p.coords.latitude, p.coords.longitude);
        setLocating(false);
      },
      () => {
        setLocating(false);
        setProblem("Location access was denied.");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const showList = open && trimmed.length >= 3 && !typedCoords;

  return (
    <div className={s.picker}>
      {!disabled && (
        <div className={s.toolbar}>
          <div className={s.search}>
            <Icon name="search" size={16} className={s.searchIcon} />
            <input
              type="search"
              role="combobox"
              aria-label="Search for a place, or paste a Google Maps link"
              aria-expanded={showList}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={
                showList && active >= 0 ? `${listId}-${active}` : undefined
              }
              placeholder="Search a place, or paste a Google Maps link"
              className={`${f.control} ${s.query}`}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
                setProblem(null);
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => setOpen(false)}
              onKeyDown={onKey}
            />
            {showList && (
              <div className={s.popover}>
                {searching && !results.length ? (
                  <div className={s.status}>
                    <Spinner size="small" /> Searching…
                  </div>
                ) : results.length ? (
                  <ul id={listId} role="listbox" className={s.list}>
                    {results.map((r, i) => (
                      <li
                        key={r.id + i}
                        id={`${listId}-${i}`}
                        role="option"
                        aria-selected={i === active}
                        className={s.option}
                        onMouseEnter={() => setActive(i)}
                        // Before the input's blur closes the list.
                        onMouseDown={(e) => {
                          e.preventDefault();
                          choose(r);
                        }}
                      >
                        <Icon name="pin" size={16} />
                        <span className={s.text}>
                          <span className={s.title}>{r.name}</span>
                          {r.detail && (
                            <span className={s.detail}>{r.detail}</span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className={s.status}>
                    No matches. Small businesses often aren't listed; try the
                    street or area, or paste a Google Maps link.
                  </div>
                )}
              </div>
            )}
          </div>
          <Button type="button" icon="pin" busy={locating} onClick={useMine}>
            My Location
          </Button>
        </div>
      )}
      <div
        ref={boxRef}
        className={s.map}
        style={{ height }}
        aria-label="Map. Click to place the pin, or drag the pin to move it."
      />
      {problem ? (
        <span className={s.problem} role="status">
          <Icon name="alert" size={14} />
          {problem}
        </span>
      ) : (
        <span className={s.caption}>
          {has
            ? (near(picked) ? picked!.name : name) || coords(lat!, lng!)
            : disabled
              ? "No location set."
              : "Click the map, search, or use your location to place the pin."}
        </span>
      )}
    </div>
  );
}
