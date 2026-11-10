// Mars bridge (Stage 3: embedded in the Cosmic Atlas React app).
//
// Unity -> JS: MarsReport(kind, json) stores the parsed report on window.__mars[kind] (read by tests and the
// standalone benchmark page) and, when the host app registered one, calls window.__marsEvent(kind, data) so React
// reacts immediately (pose, proximity, discovery, mode changes).
//
// JS -> Unity input: Unity does NOT read the keyboard itself (WebGLInput.captureAllKeyboardInput = false). The React
// app's single input manager owns the keyboard and publishes the current axes on window.__marsInput (a function that
// returns [moveX, moveY, lookX, lookY, sprint]); MarsGetInput copies them into a C# float buffer every frame. So there
// is exactly one keyboard system, and its mode rules (no movement while a dialog is open, etc.) also apply to Unity.
//
// JS -> Unity commands: unityInstance.SendMessage('MarsPrototype', <method>, <string>) — see MarsPrototype.cs.
mergeInto(LibraryManager.library, {
  MarsReport: function (kindPtr, jsonPtr) {
    if (typeof window === 'undefined') return;
    var m = window.__mars || (window.__mars = { reports: 0 });
    var kind = UTF8ToString(kindPtr);
    var data;
    try { data = JSON.parse(UTF8ToString(jsonPtr)); } catch (e) { data = { parseError: String(e) }; }
    m[kind] = data;
    m.reports += 1;
    m.updatedAt = performance.now();
    if (typeof window.__marsEvent === 'function') {
      try { window.__marsEvent(kind, data); } catch (e) { console.error('[MarsBridge] host handler failed', e); }
    }
  },

  MarsGetInput: function (bufPtr, n) {
    var a = null;
    if (typeof window !== 'undefined' && typeof window.__marsInput === 'function') {
      try { a = window.__marsInput(); } catch (e) { a = null; }
    }
    for (var i = 0; i < n; i++) HEAPF32[(bufPtr >> 2) + i] = a && typeof a[i] === 'number' && isFinite(a[i]) ? a[i] : 0;
  }
});
