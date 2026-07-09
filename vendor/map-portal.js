(function(global) {
  'use strict';

  function cfg() { return global.MAP_PORTAL || null; }

  function viewerBuild() {
    return global.VIEWER_BUILD || '2026-07-09-ios10';
  }

  function buildViewerUrl(sceneId, backPath) {
    var url = './viewer.html?id=' + encodeURIComponent(sceneId);
    var branches = global.SIDE_BRANCHES;
    if (branches && branches.length > 0) {
      url += '&sideBranches=' + encodeURIComponent(JSON.stringify(branches));
    }
    url += '&back=' + encodeURIComponent(backPath || global.MAP_PORTAL_BACK || './map.html');
    url += '&v=' + encodeURIComponent(viewerBuild());
    url += '&t=' + Date.now();
    return url;
  }

  function goToPortalScene(sceneId) {
    var p = cfg();
    var sid = sceneId || (p && p.sceneId);
    if (!sid) return;
    global.location.href = buildViewerUrl(sid, global.MAP_PORTAL_BACK || './map.html');
  }

  function goToPortalMap() {
    var p = cfg();
    if (!p || !p.fullMapPage) return;
    global.location.href = './' + p.fullMapPage;
  }

  function bindMapPortalLongPress(portalEl) {
    if (!portalEl || portalEl._portalLongPressBound) return;
    portalEl._portalLongPressBound = true;
    var HOLD_MS = 520, MOVE_TOL = 16, timer = null, moved = false, sx = 0, sy = 0, longFired = false;
    function clearTimer() { if (timer) { clearTimeout(timer); timer = null; } }
    function onDown(cx, cy) {
      moved = false; longFired = false; sx = cx; sy = cy; clearTimer();
      timer = setTimeout(function() { longFired = true; goToPortalMap(); }, HOLD_MS);
    }
    function onMove(cx, cy) {
      if (moved) return;
      if (Math.hypot(cx - sx, cy - sy) > MOVE_TOL) { moved = true; clearTimer(); }
    }
    function onUp() { clearTimer(); }
    portalEl.addEventListener('touchstart', function(e) {
      if (!e.touches || !e.touches.length) return;
      onDown(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    portalEl.addEventListener('touchmove', function(e) {
      if (!e.touches || !e.touches.length) return;
      onMove(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    portalEl.addEventListener('touchend', onUp, { passive: true });
    portalEl.addEventListener('touchcancel', onUp, { passive: true });
    portalEl.addEventListener('mousedown', function(e) { if (e.button !== 0) return; onDown(e.clientX, e.clientY); });
    portalEl.addEventListener('mousemove', function(e) { if (e.buttons !== 1) return; onMove(e.clientX, e.clientY); });
    portalEl.addEventListener('mouseup', onUp);
    portalEl.addEventListener('mouseleave', onUp);
    portalEl.addEventListener('click', function(e) {
      if (!longFired) return;
      e.preventDefault(); e.stopPropagation(); longFired = false;
    }, true);
  }

  function isAppleMobileOrTablet() {
    var ua = navigator.userAgent || '';
    if (/iPad|iPhone|iPod/i.test(ua)) return true;
    try { if (navigator.userAgentData && navigator.userAgentData.platform === 'iOS') return true; } catch (e1) {}
    if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return true;
    if (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 0 && 'ontouchstart' in global) return true;
    return false;
  }

  function isMapTouchUI() {
    if (isAppleMobileOrTablet()) return true;
    if ('ontouchstart' in global) return true;
    if (navigator.maxTouchPoints > 0) return true;
    return global.matchMedia && global.matchMedia('(hover: none)').matches;
  }

  function useMapFixedPortalLayout() { return isMapTouchUI(); }

  function useMapPhonePortalLayout() {
    return !useMapFixedPortalLayout() && global.innerWidth < 768;
  }

  function getPortalPinPos() {
    var p = cfg();
    return {
      x: (parseFloat(p.pinX) || 0) + (parseFloat(p.mapOffsetX) || 0),
      y: (parseFloat(p.pinY) || 0) + (parseFloat(p.mapOffsetY) || 0)
    };
  }

  function pinPercentThroughObjectFitCover(pinX, pinY, imageAR) {
    if (!imageAR || !isFinite(imageAR) || imageAR <= 0) return { x: pinX, y: pinY };
    var px = pinX / 100, py = pinY / 100, dx, dy;
    if (imageAR >= 1) {
      var visW = 1 / imageAR, offX = (1 - visW) / 2;
      dx = (px - offX) / visW; dy = py;
    } else {
      var visH = imageAR, offY = (1 - visH) / 2;
      dx = px; dy = (py - offY) / visH;
    }
    return { x: Math.max(0, Math.min(100, dx * 100)), y: Math.max(0, Math.min(100, dy * 100)) };
  }

  function getPortalMapImageAspect() {
    var el = document.getElementById('mapPortalMap');
    if (!el || !el.naturalWidth) return 1;
    return el.naturalWidth / el.naturalHeight;
  }

  function layoutMapPortalPin() {
    var pinEl = document.getElementById('mapPortalPin');
    if (!pinEl) return;
    var pos = getPortalPinPos();
    var display = pinPercentThroughObjectFitCover(pos.x, pos.y, getPortalMapImageAspect());
    pinEl.style.left = display.x + '%';
    pinEl.style.top = display.y + '%';
  }

  function getPortalAnchorPos() {
    var p = cfg();
    var phone = useMapPhonePortalLayout();
    return {
      x: phone ? (p.phoneAnchorX != null ? p.phoneAnchorX : 97) : (p.anchorX != null ? p.anchorX : 97),
      y: phone ? (p.phoneAnchorY != null ? p.phoneAnchorY : 82) : (p.anchorY != null ? p.anchorY : 82)
    };
  }

  function layoutMapPortal() {
    var el = document.getElementById('mapPortal');
    if (!el) return;
    var container = document.getElementById('mapStage');
    if (useMapFixedPortalLayout()) {
      if (el.parentNode !== document.body) document.body.appendChild(el);
      el.classList.add('is-fixed');
      var open = el.classList.contains('is-open');
      var vw = (global.visualViewport && global.visualViewport.width) || global.innerWidth;
      var size = open ? Math.min(vw * 0.34, 260) : 52;
      el.style.position = 'fixed';
      el.style.left = '';
      el.style.top = '';
      el.style.right = '';
      el.style.bottom = '';
      el.style.width = size + 'px';
      el.style.height = size + 'px';
      el.style.transform = 'none';
      el.style.webkitTransform = 'none';
      el.style.transformOrigin = '100% 100%';
      el.style.zIndex = '45';
      el.style.visibility = 'visible';
      el.style.opacity = '1';
      return;
    }
    if (container && el.parentNode !== container) container.appendChild(el);
    el.classList.remove('is-fixed');
    el.style.width = '';
    el.style.height = '';
    el.style.zIndex = '';
    el.style.visibility = '';
    el.style.opacity = '';
    el.style.webkitTransform = '';
    el.style.right = '';
    el.style.bottom = '';
    var phone = useMapPhonePortalLayout();
    var pos = getPortalAnchorPos();
    el.style.position = '';
    el.style.left = pos.x + '%';
    el.style.top = pos.y + '%';
    if (phone) {
      el.style.transform = 'translate3d(-100%, 0, 0)';
      el.style.transformOrigin = '100% 0%';
    } else {
      el.style.transform = 'translate3d(-100%, -100%, 0)';
      el.style.transformOrigin = '100% 100%';
    }
  }

  function scheduleMapPortalRelayout() {
    layoutMapPortal();
    layoutMapPortalPin();
    var delays = isMapTouchUI() ? [80, 200, 500, 1000, 2000] : [80];
    delays.forEach(function(ms) {
      setTimeout(function() {
        layoutMapPortal();
        layoutMapPortalPin();
      }, ms);
    });
  }

  function initMapPortal() {
    var p = cfg();
    if (!p || !p.sceneId) return;
    var container = document.getElementById('mapStage');
    if (!container) return;
    var portalEl = document.getElementById('mapPortal');
    if (!portalEl) {
      portalEl = document.createElement('div');
      portalEl.className = 'map-portal';
      portalEl.id = 'mapPortal';
      portalEl.innerHTML = '<div class="map-portal-caption" id="mapPortalCaption"></div><div class="map-portal-label" id="mapPortalLabel"></div><div class="map-portal-ring"><img class="map-portal-mark" id="mapPortalMark" alt=""><img class="map-portal-map" id="mapPortalMap" alt=""><div class="map-portal-pin" id="mapPortalPin"></div></div>';
      if (useMapFixedPortalLayout()) document.body.appendChild(portalEl);
      else container.appendChild(portalEl);
    }
    var captionEl = document.getElementById('mapPortalCaption');
    var labelEl = document.getElementById('mapPortalLabel');
    var markEl = document.getElementById('mapPortalMark');
    var mapEl = document.getElementById('mapPortalMap');
    var pinEl = document.getElementById('mapPortalPin');
    if (captionEl) captionEl.textContent = p.shortLabel || 'ポータル';
    if (labelEl) labelEl.textContent = p.label || 'ポータル先';
    if (markEl && p.markImage) {
      markEl.addEventListener('load', scheduleMapPortalRelayout);
      markEl.src = p.markImage;
      if (markEl.complete) scheduleMapPortalRelayout();
    }
    if (mapEl && p.mapImage) {
      mapEl.addEventListener('load', layoutMapPortalPin);
      mapEl.src = p.mapImage;
    }
    if (pinEl) {
      pinEl.innerHTML = '<div class="pin-label">' + (p.pinName || '') + '</div><div class="pin-icon" style="background:' + (p.pinColor || '#00cc44') + ';"><span class="pin-number">P</span></div>';
      layoutMapPortalPin();
      pinEl.addEventListener('click', function(e) {
        if (pinEl._portalPinTouched) { pinEl._portalPinTouched = false; return; }
        e.stopPropagation();
        goToPortalScene();
      });
      pinEl.addEventListener('touchend', function(e) {
        pinEl._portalPinTouched = true;
        e.preventDefault();
        e.stopPropagation();
        goToPortalScene();
      }, { passive: false });
    }
    scheduleMapPortalRelayout();
    bindMapPortalLongPress(portalEl);
    if (isMapTouchUI()) {
      portalEl.addEventListener('click', function(e) {
        if (e.target.closest && e.target.closest('.map-portal-pin')) return;
        portalEl.classList.toggle('is-open');
        layoutMapPortal();
        e.stopPropagation();
      });
      document.addEventListener('click', function(e) {
        if (e.target.closest && e.target.closest('.map-portal')) return;
        portalEl.classList.remove('is-open');
        layoutMapPortal();
      });
    }
  }

  function buildFromAppData(appData) {
    if (!appData || !appData.mapConfig || !appData.mapConfig.portal) return null;
    var src = appData.mapConfig.portal;
    if (!src.sceneId) return null;
    return {
      label: src.label || 'ポータル先',
      shortLabel: src.shortLabel || 'ポータル',
      markImage: src.markImage || 'portal.png',
      mapImage: src.mapImage || 'map_portal.jpg',
      fullMapPage: src.fullMapPage || 'map_portal.html',
      sceneId: src.sceneId,
      pinName: src.pinName || '',
      pinColor: src.pinColor || '#00cc44',
      pinX: src.pinX != null ? src.pinX : 51,
      pinY: src.pinY != null ? src.pinY : 74,
      mapOffsetX: src.mapOffsetX || 0,
      mapOffsetY: src.mapOffsetY || 0,
      anchorX: src.anchorX != null ? src.anchorX : 97,
      anchorY: src.anchorY != null ? src.anchorY : 82,
      phoneAnchorX: src.phoneAnchorX != null ? src.phoneAnchorX : 97,
      phoneAnchorY: src.phoneAnchorY != null ? src.phoneAnchorY : 82
    };
  }

  function bindMapPortalEvents() {
    global.addEventListener('resize', layoutMapPortal);
    global.addEventListener('orientationchange', function() { setTimeout(scheduleMapPortalRelayout, 120); });
    global.addEventListener('pageshow', function() { scheduleMapPortalRelayout(); });
    if (global.visualViewport) global.visualViewport.addEventListener('resize', scheduleMapPortalRelayout);
  }

  global.MapPortal = {
    init: initMapPortal,
    scheduleRelayout: scheduleMapPortalRelayout,
    buildFromAppData: buildFromAppData,
    bindEvents: bindMapPortalEvents
  };
})(window);
