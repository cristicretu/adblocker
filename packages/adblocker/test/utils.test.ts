/*!
 * Copyright (c) 2017-present Cliqz GmbH. All rights reserved.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import IFilter from '../src/filters/interface';
import { parseFilters } from '../src/lists';
import {
  binLookup,
  binSearch,
  createFuzzySignature,
  fastHash,
  hasUnicode,
  tokenize,
  tokenizeWithWildcards,
  tokenizeNoSkip,
} from '../src/utils';
import requests from './data/requests';
import { loadAllLists } from './utils';

function t(tokens: string[]): Uint32Array {
  return new Uint32Array(tokens.map(fastHash));
}

function checkCollisions(filters: IFilter[]) {
  const hashes: Map<number, string> = new Map();
  for (const filter of filters) {
    const id = filter.getId();
    const found = hashes.get(id);
    const raw = filter.toString();
    if (found !== undefined && found !== raw) {
      throw new Error(`expected ${raw} to not collide, found ${found} (${raw})`);
    }
    hashes.set(id, raw);
  }
}

describe('Utils', () => {
  describe('#fastHash', () => {
    const { networkFilters, cosmeticFilters } = parseFilters(loadAllLists());

    it('does not produce collision on network filters', () => {
      checkCollisions(networkFilters);
    });

    it('does not produce collision on cosmetic filters', () => {
      checkCollisions(cosmeticFilters);
    });

    it('does not produce collision on requests dataset', () => {
      // Collect all raw filters
      checkCollisions(
        parseFilters(requests.map(({ filters }) => filters.join('\n')).join('\n')).networkFilters,
      );
    });

    it('returns 0 for empty string', () => {
      expect(fastHash('')).toBe(0);
    });
  });

  it('#tokenizeWithWildcards', () => {
    expect(tokenizeWithWildcards('', false, false)).toEqual(t([]));
    expect(tokenizeWithWildcards('', true, false)).toEqual(t([]));
    expect(tokenizeWithWildcards('', false, true)).toEqual(t([]));
    expect(tokenizeWithWildcards('', true, true)).toEqual(t([]));

    expect(tokenizeWithWildcards('foo.barƬ*', false, false)).toEqual(t(['foo']));
    expect(tokenizeWithWildcards('foo.barƬ*', false, true)).toEqual(t(['foo']));
    expect(tokenizeWithWildcards('foo.barƬ*', true, false)).toEqual(t([]));
    expect(tokenizeWithWildcards('foo.barƬ*', true, true)).toEqual(t([]));

    expect(tokenizeWithWildcards('*foo.barƬ', false, false)).toEqual(t(['barƬ']));
    expect(tokenizeWithWildcards('*foo.barƬ*', false, false)).toEqual(t([]));
    expect(tokenizeWithWildcards('*foo*barƬ*', false, false)).toEqual(t([]));
    expect(tokenizeWithWildcards('foo*barƬ*', false, false)).toEqual(t([]));
    expect(tokenizeWithWildcards('foo*barƬ', false, false)).toEqual(t([]));
    expect(tokenizeWithWildcards('foo**barƬ', false, false)).toEqual(t([]));

    expect(tokenizeWithWildcards('foo/bar baz', false, false)).toEqual(t(['foo', 'bar', 'baz']));
    expect(tokenizeWithWildcards('foo/bar baz', true, false)).toEqual(t(['bar', 'baz']));
    expect(tokenizeWithWildcards('foo/bar baz', true, true)).toEqual(t(['bar']));
    expect(tokenizeWithWildcards('foo/bar baz', false, true)).toEqual(t(['foo', 'bar']));
    expect(tokenizeWithWildcards('foo////bar  baz', false, true)).toEqual(t(['foo', 'bar']));

  });

  it('#tokenize', () => {
    expect(tokenize('', false, false)).toEqual(t([]));
    expect(tokenize('foo', false, false)).toEqual(t(['foo']));
    expect(tokenize('foo/bar', false, false)).toEqual(t(['foo', 'bar']));
    expect(tokenize('foo-bar', false, false)).toEqual(t(['foo', 'bar']));
    expect(tokenize('foo.bar', false, false)).toEqual(t(['foo', 'bar']));
    expect(tokenize('foo.barƬ', false, false)).toEqual(t(['foo', 'barƬ']));
    expect(tokenize('*foo.barƬ', false, false)).toEqual(t(['foo', 'barƬ']));
    expect(tokenize('*foo*.barƬ', false, false)).toEqual(t(['foo', 'barƬ']));
    expect(tokenize('*foo*.barƬ', true, false)).toEqual(t(['foo', 'barƬ']));
    expect(tokenize('foo*.barƬ', false, false)).toEqual(t(['foo', 'barƬ']));
    expect(tokenize('foo.*barƬ', false, false)).toEqual(t(['foo', 'barƬ']));
    expect(tokenize('foo.barƬ*', false, false)).toEqual(t(['foo', 'barƬ']));
  });

  it('#tokenizeNoSkip', () => {
    expect(tokenizeNoSkip('')).toEqual(t([]));
    expect(tokenizeNoSkip('foo')).toEqual(t(['foo']));
    expect(tokenizeNoSkip('foo/bar')).toEqual(t(['foo', 'bar']));
    expect(tokenizeNoSkip('foo-bar')).toEqual(t(['foo', 'bar']));
    expect(tokenizeNoSkip('foo.bar')).toEqual(t(['foo', 'bar']));
    expect(tokenizeNoSkip('foo.barƬ')).toEqual(t(['foo', 'barƬ']));
    expect(tokenizeNoSkip('*foo.barƬ')).toEqual(t(['foo', 'barƬ']));
    expect(tokenizeNoSkip('*foo*.barƬ')).toEqual(t(['foo', 'barƬ']));
    expect(tokenizeNoSkip('*foo*.barƬ')).toEqual(t(['foo', 'barƬ']));
    expect(tokenizeNoSkip('foo*.barƬ')).toEqual(t(['foo', 'barƬ']));
    expect(tokenizeNoSkip('foo.*barƬ')).toEqual(t(['foo', 'barƬ']));
    expect(tokenizeNoSkip('foo.barƬ*')).toEqual(t(['foo', 'barƬ']));
  });

  it('#createFuzzySignature', () => {
    expect(createFuzzySignature('')).toEqual(t([]));
    expect(createFuzzySignature('foo bar')).toEqual(t(['foo', 'bar']).sort());
    expect(createFuzzySignature('bar foo')).toEqual(t(['foo', 'bar']).sort());
    expect(createFuzzySignature('foo bar foo foo')).toEqual(t(['foo', 'bar']).sort());
  });

  it('#hasUnicode', () => {
    for (let i = 0; i < 127; i += 1) {
      expect(hasUnicode(`foo${String.fromCharCode(i)}`)).toBeFalsy();
    }

    expect(hasUnicode('｡◕ ∀ ◕｡)')).toBeTruthy();
    expect(hasUnicode('｀ｨ(´∀｀∩')).toBeTruthy();
    expect(hasUnicode('__ﾛ(,_,*)')).toBeTruthy();
    expect(hasUnicode('・(￣∀￣)・:*:')).toBeTruthy();
    expect(hasUnicode('ﾟ･✿ヾ╲(｡◕‿◕｡)╱✿･ﾟ')).toBeTruthy();
    expect(hasUnicode(',。・:*:・゜’( ☻ ω ☻ )。・:*:・゜’')).toBeTruthy();
    expect(hasUnicode('(╯°□°）╯︵ ┻━┻)')).toBeTruthy();
    expect(hasUnicode('(ﾉಥ益ಥ）ﾉ ┻━┻')).toBeTruthy();
    expect(hasUnicode('┬─┬ノ( º _ ºノ)')).toBeTruthy();
    expect(hasUnicode('( ͡° ͜ʖ ͡°)')).toBeTruthy();
    expect(hasUnicode('¯_(ツ)_/¯')).toBeTruthy();
  });

  it('#binLookup', () => {
    expect(binLookup(new Uint32Array(0), 42)).toBeFalsy();
    expect(binLookup(new Uint32Array([]), 42)).toBeFalsy();
    expect(binLookup(new Uint32Array([42]), 42)).toBeTruthy();
    expect(binLookup(new Uint32Array([1, 2, 3, 4, 42]), 42)).toBeTruthy();
    expect(binLookup(new Uint32Array([1, 2, 3, 4, 42]), 1)).toBeTruthy();
    expect(binLookup(new Uint32Array([1, 2, 3, 4, 42]), 3)).toBeTruthy();
    expect(binLookup(new Uint32Array([1, 2, 3, 4, 42]), 43)).toBeFalsy();
    expect(binLookup(new Uint32Array([1, 2, 3, 4, 42]), 0)).toBeFalsy();
    expect(binLookup(new Uint32Array([1, 2, 3, 4, 42]), 5)).toBeFalsy();
  });

  describe('#binSearch', () => {
    it('returns -1 on empty array', () => {
      expect(binSearch(new Uint32Array(0), 42)).toBe(-1);
    });

    it('handles array of one element', () => {
      expect(binSearch(new Uint32Array([1]), 42)).toBe(-1);
      expect(binSearch(new Uint32Array([42]), 42)).toBe(0);
    });

    it('handles array of two elements', () => {
      expect(binSearch(new Uint32Array([0, 1]), 42)).toBe(-1);
      expect(binSearch(new Uint32Array([1, 42]), 42)).toBe(1);
      expect(binSearch(new Uint32Array([42, 1]), 42)).toBe(0);
      expect(binSearch(new Uint32Array([42, 42]), 42)).not.toBe(-1);
    });

    it('handles no match', () => {
      expect(binSearch(new Uint32Array(10000), 42)).toBe(-1);
    });

    it('handles match on first element', () => {
      const array = new Uint32Array(10000);
      for (let i = 1; i < array.length; i += 1) {
        array[i] = 1;
      }
      expect(binSearch(array, 0)).toBe(0);
    });

    it('handles match on last element', () => {
      const array = new Uint32Array(10000);
      array[array.length - 1] = 42;
      expect(binSearch(array, 42)).toBe(array.length - 1);
    });
  });
});
