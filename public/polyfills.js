/* Polyfills for newer APIs used by Strato / FoosBots that some mobile browsers lack.
   Loaded as a classic script before the app bundle so it runs first. */
(function () {
  'use strict';
  function def(obj, name, fn) {
    if (obj && typeof obj[name] !== 'function') {
      Object.defineProperty(obj, name, { value: fn, writable: true, configurable: true, enumerable: false });
    }
  }
  var AP = Array.prototype;

  def(AP, 'at', function (i) {
    var n = Math.trunc(i) || 0;
    return this[n < 0 ? this.length + n : n];
  });
  def(String.prototype, 'at', function (i) {
    var n = Math.trunc(i) || 0;
    var c = this.charAt(n < 0 ? this.length + n : n);
    return c === '' ? undefined : c;
  });
  def(AP, 'findLast', function (fn, thisArg) {
    for (var i = this.length - 1; i >= 0; i--) if (fn.call(thisArg, this[i], i, this)) return this[i];
    return undefined;
  });
  def(AP, 'findLastIndex', function (fn, thisArg) {
    for (var i = this.length - 1; i >= 0; i--) if (fn.call(thisArg, this[i], i, this)) return i;
    return -1;
  });
  def(AP, 'toSorted', function (cmp) {
    return this.slice().sort(cmp);
  });
  def(AP, 'toReversed', function () {
    return this.slice().reverse();
  });
  def(AP, 'toSpliced', function () {
    var c = this.slice();
    c.splice.apply(c, arguments);
    return c;
  });
  def(Object, 'hasOwn', function (o, k) {
    return Object.prototype.hasOwnProperty.call(o, k);
  });

  if (typeof window.structuredClone !== 'function') {
    window.structuredClone = function (v) {
      return v === undefined ? v : JSON.parse(JSON.stringify(v));
    };
  }

  if (window.crypto && typeof window.crypto.randomUUID !== 'function') {
    window.crypto.randomUUID = function () {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });
    };
  }

  // Intl.Segmenter (grapheme granularity only) – missing in Firefox < 125
  if (window.Intl && typeof Intl.Segmenter !== 'function') {
    var Segmenter = function () {};
    Segmenter.prototype.segment = function (input) {
      var str = String(input);
      var chars = Array.from(str);
      var index = 0;
      var segs = chars.map(function (segment) {
        var s = { segment: segment, index: index, input: str };
        index += segment.length;
        return s;
      });
      var res = {
        containing: function (i) {
          i = i || 0;
          return segs.find(function (s) {
            return i >= s.index && i < s.index + s.segment.length;
          });
        },
      };
      res[Symbol.iterator] = function () {
        return segs[Symbol.iterator]();
      };
      return res;
    };
    Segmenter.prototype.resolvedOptions = function () {
      return { locale: 'en', granularity: 'grapheme' };
    };
    Segmenter.supportedLocalesOf = function () {
      return ['en'];
    };
    Intl.Segmenter = Segmenter;
  }
})();
