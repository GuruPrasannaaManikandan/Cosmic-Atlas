// Mars prototype bridge (Stage 2). Unity -> JS: JSON reports on window.__mars so a page or test harness reads Unity's
// own frame timing and state. JS -> Unity: unityInstance.SendMessage('MarsPrototype', 'SetProfile', 'balanced'),
// 'RunBenchmark' ('60'), 'SetTau' ('0.9'), 'SetUtc' ('2007-09-11T12:00:00Z').
mergeInto(LibraryManager.library, {
  MarsReport: function (kindPtr, jsonPtr) {
    if (typeof window === 'undefined') return;
    var m = window.__mars || (window.__mars = { reports: 0 });
    var kind = UTF8ToString(kindPtr);
    try { m[kind] = JSON.parse(UTF8ToString(jsonPtr)); } catch (e) { m[kind] = { parseError: String(e) }; }
    m.reports += 1;
    m.updatedAt = performance.now();
  }
});
