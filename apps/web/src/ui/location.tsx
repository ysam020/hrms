import { lazy, Suspense } from "react";
import { Skeleton } from "./display";
import type { LocationPickerProps } from "./LocationPicker";

export type { LocationPickerProps, LocationValue } from "./LocationPicker";

const Picker = lazy(() => import("./LocationPicker"));

/** Map location picker; Leaflet loads with the first one shown. */
export function LocationPicker(props: LocationPickerProps) {
  return (
    <Suspense fallback={<Skeleton height={props.height ?? 320} radius={10} />}>
      <Picker {...props} />
    </Suspense>
  );
}
