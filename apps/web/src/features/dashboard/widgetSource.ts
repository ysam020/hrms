import { createContext, useContext } from "react";
import { markTransitionSource } from "@next/motion";

// The widget a link lives in. A widget link that navigates marks the widget
// as the source of the view transition, so only that widget's heading morphs
// into the destination page's title (several widgets can lead to one page).

export const WidgetIdContext = createContext<string | null>(null);

export const widgetSourceKey = (id: string) => `widget:${id}`;

/** onClick for links inside a widget: mark it as the transition source. */
export function useMarkWidgetSource() {
  const id = useContext(WidgetIdContext);
  return () => {
    if (id) markTransitionSource(widgetSourceKey(id));
  };
}
