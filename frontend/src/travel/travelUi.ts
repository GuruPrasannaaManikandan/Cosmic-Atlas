/** UI state the flight keyboard must respect (set by TravelHUD). Separate module so the input manager can read it
 *  without importing the flight key handlers (no import cycle). */
export const travelUi = { helpOpen: false }
