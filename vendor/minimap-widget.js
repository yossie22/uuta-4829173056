/**
 * VR画面用ミニ地図（丸表示・タップで4倍拡大）
 * APP_DATA.mapConfig と各シーンの lat/lng / heading を使用
 */
(function(global) {
  'use strict';

  var DEFAULT_CONFIG = {
    image: 'map.jpg',
    bounds: {
      topLeft: { lat: 33.52093, lng: 131.217184 },
      bottomRight: { lat: 33.520168, lng: 131.218755 }
    },
    pinOffset: { x: 0, y: 0 },
    insets: { left: 0, top: 0, right: 0, bottom: 0 }
  };

  var JA_DIRS_16 = [
    '北', '北北東', '北東', '東北東', '東', '東南東', '南東', '南南東',
    '南', '南南西', '南西', '西南西', '西', '西北西', '北西', '北北西'
  ];

  function mercatorY(lat) {
    var r = lat * Math.PI / 180;
    return Math.log(Math.tan(Math.PI / 4 + r / 2));
  }

  function isPseudoIllustratedMapBounds(bounds) {
    if (!bounds || !bounds.topLeft || !bounds.bottomRight) return false;
    var tl = bounds.topLeft;
    var br = bounds.bottomRight;
    var vals = [tl.lat, tl.lng, br.lat, br.lng];
    for (var i = 0; i < vals.length; i++) {
      if (!isFinite(vals[i]) || vals[i] < -0.001 || vals[i] > 100.001) return false;
    }
    return Math.abs(tl.lat - br.lat) > 0.01 || Math.abs(tl.lng - br.lng) > 0.01;
  }

  function gpsToPercentLinear(lat, lng, bounds) {
    var lngSpan = bounds.bottomRight.lng - bounds.topLeft.lng;
    var latSpan = bounds.topLeft.lat - bounds.bottomRight.lat;
    return {
      x: lngSpan ? (lng - bounds.topLeft.lng) / lngSpan * 100 : 0,
      y: latSpan ? (bounds.topLeft.lat - lat) / latSpan * 100 : 0
    };
  }

  function normalizeConfig(cfg) {
    cfg = cfg || {};
    return {
      image: cfg.image || DEFAULT_CONFIG.image,
      bounds: cfg.bounds || DEFAULT_CONFIG.bounds,
      pinOffset: cfg.pinOffset || DEFAULT_CONFIG.pinOffset,
      insets: cfg.insets || DEFAULT_CONFIG.insets,
      twoPoint: cfg.twoPoint || null,
      linearCoords: !!cfg.linearCoords || isPseudoIllustratedMapBounds(cfg.bounds || DEFAULT_CONFIG.bounds),
      showRoutePins: cfg.showRoutePins === true,
      mapHeadingNorthOffset: cfg.mapHeadingNorthOffset != null ?
        Number(cfg.mapHeadingNorthOffset) : 0,
      mapHeadingFineOffset: cfg.mapHeadingFineOffset != null ?
        Number(cfg.mapHeadingFineOffset) : 0
    };
  }

  function clampNum(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
  }

  function northMarkPosition(offset) {
    var off = ((offset || 0) % 360 + 360) % 360;
    var svgA = (0 - off) * Math.PI / 180;
    var dist = 46;
    return {
      x: 50 + dist * Math.sin(svgA),
      y: 50 - dist * Math.cos(svgA)
    };
  }

  function compassToSvgAngle(compassDeg, northOffset) {
    return ((compassDeg - (northOffset || 0)) % 360 + 360) % 360;
  }

  function bearingToJaLabel(deg) {
    if (deg == null || isNaN(deg)) return '—';
    var d = ((deg % 360) + 360) % 360;
    var idx = Math.round(d / 22.5) % 16;
    return JA_DIRS_16[idx];
  }

  function gpsToPercent(lat, lng, config) {
    var bounds = config.bounds;
    var tp = config.twoPoint;
    var x;
    var y;
    if (tp && tp.p1 && tp.p2) {
      var p1 = tp.p1;
      var p2 = tp.p2;
      x = Math.abs(p2.lng - p1.lng) > 1e-12 ?
        p1.x + (lng - p1.lng) / (p2.lng - p1.lng) * (p2.x - p1.x) : p1.x;
      var y1 = mercatorY(p1.lat);
      var y2 = mercatorY(p2.lat);
      var ym = mercatorY(lat);
      if (Math.abs(y2 - y1) > 1e-12) {
        var s1 = p1.y / 100;
        var s2 = p2.y / 100;
        var sm = (ym - y1) / (y2 - y1);
        y = (s1 + sm * (s2 - s1)) * 100;
      } else {
        y = p1.y;
      }
    } else if (config.linearCoords) {
      var lin = gpsToPercentLinear(lat, lng, bounds);
      x = lin.x;
      y = lin.y;
    } else {
      var lngSpan = bounds.bottomRight.lng - bounds.topLeft.lng;
      var yTop = mercatorY(bounds.topLeft.lat);
      var yBot = mercatorY(bounds.bottomRight.lat);
      x = lngSpan ? (lng - bounds.topLeft.lng) / lngSpan * 100 : 0;
      y = (yTop - yBot) ? (yTop - mercatorY(lat)) / (yTop - yBot) * 100 : 0;
    }
    var il = config.insets.left || 0;
    var it = config.insets.top || 0;
    var ir = config.insets.right || 0;
    var ib = config.insets.bottom || 0;
    x = il + x * (100 - il - ir) / 100;
    y = it + y * (100 - it - ib) / 100;
    x += (config.pinOffset.x || 0);
    y += (config.pinOffset.y || 0);
    return { x: x, y: y };
  }

  function buildPinsFromAppData(appData) {
    var scenes = (appData && appData.scenes) || [];
    return scenes.filter(function(s) {
      return s && s.lat != null && s.lng != null &&
        !isNaN(Number(s.lat)) && !isNaN(Number(s.lng));
    }).map(function(s) {
      return {
        id: s.id,
        lat: Number(s.lat),
        lng: Number(s.lng),
        position: s.position != null ? Number(s.position) : 0,
        name: s.name || s.id
      };
    }).sort(function(a, b) {
      return a.position - b.position;
    });
  }

  function findPinPercent(pins, sceneId, config) {
    if (!sceneId || !pins || !pins.length) return null;
    var i;
    for (i = 0; i < pins.length; i++) {
      if (pins[i].id === sceneId) {
        return gpsToPercent(pins[i].lat, pins[i].lng, config);
      }
    }
    return null;
  }

  function pegmanSvg() {
    return '<g class="mini-map-pegman-g" style="display:none">' +
      '<path class="mini-map-view-cone" d="M0,0 L-7.5,-15.5 Q0,-17.5 7.5,-15.5 Z"></path>' +
      '<circle class="mini-map-pegman-body" r="4.2" cx="0" cy="1.2"></circle>' +
      '</g>';
  }

  function MiniMapWidget(rootEl, options) {
    this.rootEl = rootEl;
    this.config = normalizeConfig(options && options.config);
    this.pins = (options && options.pins) || [];
    this.expanded = false;
    this.dirLabelEl = (options && options.dirLabelEl) ||
      document.getElementById('miniMapDirLabel');
    this.diskEl = rootEl.querySelector('.mini-map-disk');
    this.panLayer = rootEl.querySelector('.mini-map-pan');
    this.imgEl = rootEl.querySelector('.mini-map-img');
    this.svgEl = rootEl.querySelector('.mini-map-overlay');
    if (this.imgEl && this.config.image) {
      this.imgEl.src = this.config.image;
    }
    this._renderStatic();
    var self = this;
    rootEl.addEventListener('click', function(e) {
      e.stopPropagation();
      self.toggleExpand();
      if (typeof self.onInteract === 'function') self.onInteract();
    });
  }

  MiniMapWidget.prototype.setPins = function(pins) {
    this.pins = pins || [];
    this._renderStatic();
  };

  MiniMapWidget.prototype.toggleExpand = function() {
    this.expanded = !this.expanded;
    this.rootEl.classList.toggle('is-expanded', this.expanded);
  };

  MiniMapWidget.prototype.collapse = function() {
    this.expanded = false;
    this.rootEl.classList.remove('is-expanded');
  };

  MiniMapWidget.prototype._renderStatic = function() {
    if (!this.svgEl) return;
    var pts = [];
    var pinDots = '';
    var i;
    var p;
    var pos;
    if (this.config.showRoutePins) {
      for (i = 0; i < this.pins.length; i++) {
        p = this.pins[i];
        pos = gpsToPercent(p.lat, p.lng, this.config);
        pts.push(pos.x + ',' + pos.y);
        pinDots += '<circle class="mini-map-pin-dot" cx="' + pos.x + '" cy="' + pos.y +
          '" r="2.2" data-id="' + p.id + '"></circle>';
      }
    }
    var trail = (this.config.showRoutePins && pts.length >= 2) ?
      '<polyline class="mini-map-trail" points="' + pts.join(' ') + '"></polyline>' : '';
    var nm = northMarkPosition(this.config.mapHeadingNorthOffset);
    this.svgEl.innerHTML =
      trail +
      pinDots +
      '<text class="mini-map-north-mark" x="' + nm.x + '" y="' + nm.y + '">北</text>' +
      pegmanSvg() +
      '<circle class="mini-map-you-dot" r="3.2" style="display:none"></circle>';
    this.pegmanG = this.svgEl.querySelector('.mini-map-pegman-g');
    this.youDot = this.svgEl.querySelector('.mini-map-you-dot');
  };

  MiniMapWidget.prototype._routeBounds = function() {
    var minX = 100;
    var minY = 100;
    var maxX = 0;
    var maxY = 0;
    var i;
    var p;
    var pos;
    if (!this.pins.length) {
      return { minX: 0, minY: 0, maxX: 100, maxY: 100, w: 100, h: 100 };
    }
    for (i = 0; i < this.pins.length; i++) {
      p = this.pins[i];
      pos = gpsToPercent(p.lat, p.lng, this.config);
      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
      maxX = Math.max(maxX, pos.x);
      maxY = Math.max(maxY, pos.y);
    }
    var pad = 8;
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(100, maxX + pad);
    maxY = Math.min(100, maxY + pad);
    return {
      minX: minX,
      minY: minY,
      maxX: maxX,
      maxY: maxY,
      w: maxX - minX,
      h: maxY - minY
    };
  };

  MiniMapWidget.prototype._computeViewAnchor = function(pos, rb) {
    var edge = 20;
    var minA = edge;
    var maxA = 100 - edge;
    var routeRoomL = Math.max(0, pos.x - rb.minX);
    var routeRoomR = Math.max(0, rb.maxX - pos.x);
    var routeRoomT = Math.max(0, pos.y - rb.minY);
    var routeRoomB = Math.max(0, rb.maxY - pos.y);
    var routeSumX = routeRoomL + routeRoomR || 1;
    var routeSumY = routeRoomT + routeRoomB || 1;
    var mapRoomL = Math.max(0.5, pos.x);
    var mapRoomR = Math.max(0.5, 100 - pos.x);
    var mapRoomT = Math.max(0.5, pos.y);
    var mapRoomB = Math.max(0.5, 100 - pos.y);
    var blend = 0.65;
    var ratioX = (1 - blend) * (routeRoomL / routeSumX) +
      blend * (mapRoomL / (mapRoomL + mapRoomR));
    var ratioY = (1 - blend) * (routeRoomT / routeSumY) +
      blend * (mapRoomT / (mapRoomT + mapRoomB));
    return {
      x: minA + ratioX * (maxA - minA),
      y: minA + ratioY * (maxA - minA)
    };
  };

  MiniMapWidget.prototype._maxZoomForAnchor = function(pos, anchor) {
    var m = 4;
    var z = 99;
    if (pos.x > m) z = Math.min(z, anchor.x / pos.x);
    if ((100 - pos.x) > m) z = Math.min(z, (100 - anchor.x) / (100 - pos.x));
    if (pos.y > m) z = Math.min(z, anchor.y / pos.y);
    if ((100 - pos.y) > m) z = Math.min(z, (100 - anchor.y) / (100 - pos.y));
    return Math.max(1, Math.min(5, z));
  };

  MiniMapWidget.prototype._clampPan = function(tx, ty, zoom) {
    var z = zoom;
    if (z <= 0) return { tx: tx, ty: ty };
    var txMin = z > 1 ? 100 - 100 * z : 100 * (1 - z);
    var tyMin = z > 1 ? 100 - 100 * z : 100 * (1 - z);
    return {
      tx: clampNum(tx, txMin, 0),
      ty: clampNum(ty, tyMin, 0)
    };
  };

  MiniMapWidget.prototype._applyMapView = function(pos) {
    if (!this.panLayer || !pos) return;
    var rb = this._routeBounds();
    var span = Math.max(rb.w, rb.h, 14);
    var anchor = this._computeViewAnchor(pos, rb);
    var zoomRoute = 90 / span;
    var zoomEdge = this._maxZoomForAnchor(pos, anchor);
    var zoom = Math.max(1, Math.min(5, zoomRoute, zoomEdge));
    var tx = anchor.x - pos.x * zoom;
    var ty = anchor.y - pos.y * zoom;
    var pan = this._clampPan(tx, ty, zoom);
    this.panLayer.style.transform =
      'translate(' + pan.tx + '%, ' + pan.ty + '%) scale(' + zoom + ')';
    this.panLayer.style.transformOrigin = '0 0';
  };

  MiniMapWidget.prototype.update = function(state) {
    state = state || {};
    if (!this.svgEl) return;
    var hasPos = state.lat != null && state.lng != null &&
      !isNaN(state.lat) && !isNaN(state.lng);
    var pos = hasPos ? gpsToPercent(state.lat, state.lng, this.config) : null;
    var yawDeg = state.yawDeg || 0;
    var northOff = state.northOff;
    var hasBearing = northOff != null && !isNaN(northOff);
    var bearing = hasBearing ?
      northOff + yawDeg + (this.config.mapHeadingFineOffset || 0) +
      (state.vrHeadingFine || 0) : yawDeg;
    var activeId = state.sceneId || '';
    var showBearing = state.showBearing !== false && hasBearing;

    if (!pos && activeId) {
      pos = findPinPercent(this.pins, activeId, this.config);
    }
    if (!pos && showBearing) {
      pos = { x: 50, y: 50 };
    }

    var pinEls = this.svgEl.querySelectorAll('.mini-map-pin-dot');
    var j;
    for (j = 0; j < pinEls.length; j++) {
      var isActive = pinEls[j].getAttribute('data-id') === activeId;
      pinEls[j].classList.toggle('is-active', isActive);
    }

    if (this.youDot) {
      if (hasPos && pos && !showBearing) {
        this.youDot.setAttribute('cx', pos.x);
        this.youDot.setAttribute('cy', pos.y);
        this.youDot.style.display = '';
      } else {
        this.youDot.style.display = 'none';
      }
    }

    if (pos) {
      this._applyMapView(pos);
    }

    var svgBearing = compassToSvgAngle(bearing, this.config.mapHeadingNorthOffset);

    if (this.pegmanG) {
      if (pos && showBearing) {
        this.pegmanG.setAttribute('transform',
          'translate(' + pos.x + ' ' + pos.y + ') rotate(' + svgBearing + ')');
        this.pegmanG.style.display = '';
      } else {
        this.pegmanG.style.display = 'none';
      }
    }

    if (this.dirLabelEl) {
      if (showBearing) {
        this.dirLabelEl.textContent = bearingToJaLabel(bearing);
        this.dirLabelEl.style.display = '';
      } else {
        this.dirLabelEl.textContent = '—';
        this.dirLabelEl.style.display = 'none';
      }
    }
  };

  global.MiniMapWidget = MiniMapWidget;
  global.MiniMapGps = {
    mercatorY: mercatorY,
    gpsToPercent: gpsToPercent,
    buildPinsFromAppData: buildPinsFromAppData,
    normalizeConfig: normalizeConfig,
    bearingToJaLabel: bearingToJaLabel,
    DEFAULT_CONFIG: DEFAULT_CONFIG
  };
})(typeof window !== 'undefined' ? window : this);
