/**
 * 270度VR（第1段階）— 立方体タイルの指定面を黒表示
 * BUILD=v2
 *
 * data.js 例（作品全体）:
 *   "panoramaBlack90": { "faces": ["b"] }
 *
 * シーンごと:
 *   "panoramaBlack90": { "faces": ["b"] }
 *   "panoramaBlack90": false   … このシーンだけOFF
 *
 * 面の向き（マジパン標準）:
 *   f=正面  b=背面  l=左  r=右  u=上  d=下
 * 撮影者は多くの場合 b（背面）。合わないときは faces を変えてください。
 */
(function(global) {
  'use strict';

  var BLACK_TILE_URL = 'vendor/black-tile-256.jpg?v=1';

  function normalizeFaces(list) {
    if (!list) return [];
    if (typeof list === 'string') list = [list];
    if (!Array.isArray(list)) return [];
    return list.map(function(f) { return String(f).toLowerCase(); }).filter(Boolean);
  }

  function getBlackFaces(sceneData, appData) {
    if (!sceneData) return [];
    var cfg = sceneData.panoramaBlack90;
    if (cfg === false) return [];
    if (cfg == null && appData) cfg = appData.panoramaBlack90;
    if (!cfg || cfg.enabled === false) return [];
    if (cfg.true && !cfg.faces && global.console) {
      console.warn('⚠️ 黒90度: data.js の書き方が違います。「"true": ["b"]」ではなく「"enabled": true」と「"faces": ["b"]」にしてください。');
    }
    if (cfg.faces) return normalizeFaces(cfg.faces);
    if (cfg.face) return normalizeFaces(cfg.face);
    return ['b'];
  }

  function createTileSource(sceneId, tilesBase, blackFaces) {
    var base = tilesBase || 'tiles';
    if (!blackFaces || !blackFaces.length) {
      return Marzipano.ImageUrlSource.fromString(base + '/' + sceneId + '/{z}/{f}/{y}/{x}.jpg');
    }
    var blackSet = {};
    blackFaces.forEach(function(f) { blackSet[f] = true; });
    var tileFn = function(tile) {
      if (blackSet[tile.face]) {
        return { url: BLACK_TILE_URL };
      }
      return {
        url: base + '/' + sceneId + '/' + tile.z + '/' + tile.face + '/' + tile.y + '/' + tile.x + '.jpg'
      };
    };
    return new Marzipano.ImageUrlSource(tileFn, {});
  }

  global.PanoBlack90 = {
    BLACK_TILE_URL: BLACK_TILE_URL,
    getBlackFaces: getBlackFaces,
    createTileSource: createTileSource
  };
})(typeof window !== 'undefined' ? window : this);
