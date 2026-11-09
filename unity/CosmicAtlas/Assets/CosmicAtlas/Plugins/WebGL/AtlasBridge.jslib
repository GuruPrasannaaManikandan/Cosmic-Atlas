// Minimal JS <-> Unity bridge for the WebGL build (first slice of the blueprint protocol, section 7.3).
// Unity -> JS: frame statistics and the current station/viewpoint are published on window.__atlas so the page (or a
// test harness) can read Unity's OWN frame time rather than inferring it from requestAnimationFrame.
// JS -> Unity: unityInstance.SendMessage('ShowcaseController', 'SelectFromJs', 'station,shot') and
//              unityInstance.SendMessage('ShowcaseController', 'SetQualityFromJs', 'Low|Medium|High|Ultra').
mergeInto(LibraryManager.library, {
  AtlasReportFrame: function (avgMs, station, shot, quality) {
    if (typeof window === 'undefined') return;
    var a = window.__atlas || (window.__atlas = { frames: 0 });
    a.avgFrameMs = avgMs;
    a.station = station;
    a.shot = shot;
    a.quality = quality;
    a.frames += 1;
    a.updatedAt = performance.now();
  },
  AtlasReportReady: function (stationCount, qualityPtr, devicePtr, diagPtr) {
    if (typeof window === 'undefined') return;
    var a = window.__atlas || (window.__atlas = { frames: 0 });
    a.stationCount = stationCount;
    a.autoQuality = UTF8ToString(qualityPtr);
    a.device = UTF8ToString(devicePtr);
    try { a.diagnostics = JSON.parse(UTF8ToString(diagPtr)); } catch (e) { a.diagnostics = { parseError: String(e) }; }
    a.ready = true;
  }
});
