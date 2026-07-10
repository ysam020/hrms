/**
 * LocationPicker
 *
 * An interactive map (OpenStreetMap / CartoDB via Leaflet) that lets users
 * pick a lat/lng by:
 *  - Clicking/dragging a marker on the map
 *  - Using the "Use my current location" button
 *  - Searching with a text query (Nominatim geocoding)
 *
 * Fully theme-aware: switches between light (OSM) and dark (CartoDB Dark
 * Matter) tile layers, and re-styles Leaflet's native UI controls to match.
 *
 * Props:
 *   lat / lng    — controlled coordinates (null = not yet set)
 *   name         — human-readable label for the location
 *   onChange     — called with { lat, lng, name } whenever the marker moves
 *   disabled     — read-only mode
 *   height       — map container height in px (default 320)
 */

import { useContext, useEffect, useId, useRef, useState } from "react";
import type React from "react";
import Box from "@mui/material/Box";
import Button from "@web/shared/components/Button";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import InputAdornment from "@mui/material/InputAdornment";
import MyLocationIcon from "@mui/icons-material/MyLocation";
import SearchIcon from "@mui/icons-material/Search";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import "leaflet/dist/leaflet.css";

import L from "leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

// Fix Leaflet's broken default icon path when bundled with Vite
// @ts-ignore
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

// ─── Tile configurations ──────────────────────────────────────────────────────

const TILES = {
  light: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution:
      '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  },
  dark: {
    // CartoDB Dark Matter — free, no API key required
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution:
      '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors ' +
      '© <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 19,
  },
} as const;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LocationValue {
  lat: number;
  lng: number;
  name: string;
}

interface Props {
  lat?: number | null;
  lng?: number | null;
  name?: string | null;
  onChange: (v: LocationValue) => void;
  disabled?: boolean;
  height?: number;
}

// ─── Nominatim helpers ────────────────────────────────────────────────────────

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { "Accept-Language": "en" } },
    );
    const data = await res.json();
    return data?.display_name ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  } catch {
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }
}

async function geocodeSearch(
  query: string,
): Promise<{ lat: number; lng: number; name: string } | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`,
      { headers: { "Accept-Language": "en" } },
    );
    const data = await res.json();
    if (!data?.[0]) return null;
    return {
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon),
      name: data[0].display_name,
    };
  } catch {
    return null;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function LocationPicker({
  lat,
  lng,
  name,
  onChange,
  disabled = false,
  height = 320,
}: Props) {
  const { theme } = useContext(ThemeContext);
  const isDark = theme === "dark";

  // Unique CSS scope so multiple pickers on the same page don't conflict
  const scopeId = useId().replace(/:/g, "");
  const scopeClass = `lp-${scopeId}`;

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);

  const [locating, setLocating] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // ── Initialize map ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const initLat = lat ?? 20.5937;
    const initLng = lng ?? 78.9629;
    const initZoom = lat && lng ? 15 : 5;

    const map = L.map(mapContainerRef.current, {
      center: [initLat, initLng],
      zoom: initZoom,
      attributionControl: true,
      zoomControl: true,
    });

    const tileCfg = isDark ? TILES.dark : TILES.light;
    const tl = L.tileLayer(tileCfg.url, {
      attribution: tileCfg.attribution,
      maxZoom: tileCfg.maxZoom,
    });
    tl.addTo(map);
    tileRef.current = tl;

    if (lat && lng) {
      const marker = L.marker([lat, lng], { draggable: !disabled }).addTo(map);
      markerRef.current = marker;
      if (!disabled) {
        marker.on("dragend", async () => {
          const pos = marker.getLatLng();
          const n = await reverseGeocode(pos.lat, pos.lng);
          onChange({ lat: pos.lat, lng: pos.lng, name: n });
        });
      }
    }

    if (!disabled) {
      map.on("click", async (e: L.LeafletMouseEvent) => {
        const { lat: cLat, lng: cLng } = e.latlng;
        if (markerRef.current) {
          markerRef.current.setLatLng([cLat, cLng]);
        } else {
          const m = L.marker([cLat, cLng], { draggable: true }).addTo(map);
          markerRef.current = m;
          m.on("dragend", async () => {
            const pos = m.getLatLng();
            const n = await reverseGeocode(pos.lat, pos.lng);
            onChange({ lat: pos.lat, lng: pos.lng, name: n });
          });
        }
        const n = await reverseGeocode(cLat, cLng);
        onChange({ lat: cLat, lng: cLng, name: n });
      });
    }

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      tileRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Swap tile layer when theme changes ────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return;
    if (tileRef.current) {
      tileRef.current.remove();
    }
    const tileCfg = isDark ? TILES.dark : TILES.light;
    const newTl = L.tileLayer(tileCfg.url, {
      attribution: tileCfg.attribution,
      maxZoom: tileCfg.maxZoom,
    });
    newTl.addTo(mapRef.current);
    tileRef.current = newTl;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDark]);

  // ── Sync marker when lat/lng prop changes externally ─────────────────────
  useEffect(() => {
    if (!mapRef.current || lat == null || lng == null) return;
    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng]);
    } else {
      const m = L.marker([lat, lng], { draggable: !disabled }).addTo(
        mapRef.current,
      );
      markerRef.current = m;
      if (!disabled) {
        m.on("dragend", async () => {
          const pos = m.getLatLng();
          const n = await reverseGeocode(pos.lat, pos.lng);
          onChange({ lat: pos.lat, lng: pos.lng, name: n });
        });
      }
    }
    mapRef.current.setView([lat, lng], Math.max(mapRef.current.getZoom(), 15));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng]);

  // ── Use current location ──────────────────────────────────────────────────
  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const n = await reverseGeocode(
          pos.coords.latitude,
          pos.coords.longitude,
        );
        onChange({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          name: n,
        });
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  // ── Search ────────────────────────────────────────────────────────────────
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    const result = await geocodeSearch(searchQuery.trim());
    setSearching(false);
    if (result) {
      onChange(result);
      setSearchQuery("");
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  // ── Dark-mode CSS injected inline for this picker instance ───────────────
  const darkStyles = isDark
    ? `
      .${scopeClass} .leaflet-control-zoom a {
        background-color: #1e2a38 !important;
        color: #cbd5e1 !important;
        border-color: #334155 !important;
      }
      .${scopeClass} .leaflet-control-zoom a:hover {
        background-color: #263546 !important;
        color: #f1f5f9 !important;
      }
      .${scopeClass} .leaflet-bar {
        border-color: #334155 !important;
        box-shadow: 0 1px 4px rgba(0,0,0,0.5) !important;
      }
      .${scopeClass} .leaflet-control-attribution {
        background: rgba(15, 23, 36, 0.82) !important;
        color: #64748b !important;
      }
      .${scopeClass} .leaflet-control-attribution a {
        color: #60a5fa !important;
      }
      .${scopeClass} .leaflet-popup-content-wrapper,
      .${scopeClass} .leaflet-popup-tip {
        background: #1e2a38 !important;
        color: #e2e8f0 !important;
        box-shadow: 0 2px 8px rgba(0,0,0,0.5) !important;
      }
    `
    : "";

  return (
    <Box>
      {/* Scoped dark-mode overrides for Leaflet's native controls */}
      {isDark && <style>{darkStyles}</style>}

      {/* ── Search + current location toolbar ── */}
      {!disabled && (
        <Box sx={{ display: "flex", gap: 1, mb: 1, alignItems: "center" }}>
          <TextField
            size="small"
            placeholder="Search for a location…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            sx={{ flex: 1 }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              },
            }}
          />
          <Button
            variant="outline"
            size="small"
            onClick={handleSearch}
            disabled={searching || !searchQuery.trim()}
            loading={searching}
            style={{ minWidth: 80, flexShrink: 0 }}
          >
            Search
          </Button>
          <Button
            variant="outline"
            size="small"
            onClick={handleUseCurrentLocation}
            disabled={locating}
            loading={locating}
            icon={<MyLocationIcon fontSize="small" />}
            style={{ flexShrink: 0 }}
          >
            My location
          </Button>
        </Box>
      )}

      {/* ── Map container ── */}
      <Box
        ref={mapContainerRef}
        className={scopeClass}
        sx={{
          height,
          borderRadius: 1,
          overflow: "hidden",
          border: "1px solid",
          borderColor: "divider",
          // Map background before tiles load
          bgcolor: isDark ? "#0f1724" : "#e8e0d8",
          // Leaflet adds an inline background — override it
          "& .leaflet-container": {
            bgcolor: isDark ? "#0f1724" : "#e8e0d8",
          },
        }}
      />

      {/* ── Location label ── */}
      {lat != null && lng != null && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ mt: 0.5, display: "block" }}
        >
          📍{" "}
          {name
            ? name.length > 80
              ? name.slice(0, 80) + "…"
              : name
            : `${lat.toFixed(6)}, ${lng.toFixed(6)}`}
        </Typography>
      )}
      {(lat == null || lng == null) && !disabled && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ mt: 0.5, display: "block" }}
        >
          Click on the map or search to set the location.
        </Typography>
      )}
    </Box>
  );
}
