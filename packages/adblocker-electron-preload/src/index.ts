/*!
 * Copyright (c) 2017-present Ghostery GmbH. All rights reserved.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { ipcRenderer } from 'electron';

import {
  DOMMonitor,
  IBackgroundCallback,
  IMessageFromBackground,
  injectScript,
} from '@cliqz/adblocker-content';

function getCosmeticsFiltersFirst(): string[] | null {
  return ipcRenderer.sendSync('get-cosmetic-filters-first', window.location.href);
}
function getCosmeticsFiltersUpdate(data: Omit<IBackgroundCallback, 'lifecycle'>) {
  ipcRenderer.send('get-cosmetic-filters', window.location.href, data);
}

function insertNode(node: Node, document: Document) {
  const parent = document.head || document.documentElement || document;
  if (parent !== null) {
    try {
      parent.appendChild(node);
    } catch (e) {
      console.error('CSP violation detected, falling back to alternative method', e);
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      document.body.appendChild(iframe);
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (iframeDoc) {
        iframeDoc.open();
        iframeDoc.write('<body></body>');
        iframeDoc.body.appendChild(node);
        iframeDoc.close();
      }
      document.body.removeChild(iframe);
    }
  }
}

function injectScriptlet(s: string, doc: Document): void {
  const script = doc.createElement('script');
  script.type = 'text/javascript';
  script.id = 'cliqz-adblocker-script';
  script.async = false;
  script.appendChild(doc.createTextNode(s));

  insertNode(script, doc);
}

function isFirefox(doc: Document) {
  try {
    return doc.defaultView?.navigator?.userAgent?.indexOf('Firefox') !== -1;
  } catch (e) {
    return false;
  }
}

async function injectScriptletFirefox(s: string, doc: Document) {
  const win = doc.defaultView!;
  const script = doc.createElement('script');
  script.async = false;
  script.id = 'cliqz-adblocker-script';
  const blob = new win.Blob([s], { type: 'text/javascript; charset=utf-8' });
  const url = win.URL.createObjectURL(blob);

  // a hack for tests to that allows for async URL.createObjectURL
  // eslint-disable-next-line @typescript-eslint/await-thenable
  script.src = await url;

  insertNode(script, doc);
  win.URL.revokeObjectURL(url);
}

export function injectScript(s: string, doc: Document): void {
  if (isFirefox(doc)) {
    injectScriptletFirefox(s, doc);
  } else {
    injectScriptlet(s, doc);
  }
}

if (window === window.top && window.location.href.startsWith('devtools://') === false) {
  (() => {
    const enableMutationObserver = ipcRenderer.sendSync('is-mutation-observer-enabled');

    let ACTIVE: boolean = true;
    let DOM_MONITOR: DOMMonitor | null = null;

    const unload = () => {
      if (DOM_MONITOR !== null) {
        DOM_MONITOR.stop();
        DOM_MONITOR = null;
      }
    };

    ipcRenderer.on(
      'get-cosmetic-filters-response',
      // TODO - implement extended filtering for Electron
      (
        _: Electron.IpcRendererEvent,
        { active /* , scripts, extended */ }: IMessageFromBackground,
      ) => {
        if (active === false) {
          ACTIVE = false;
          unload();
          return;
        }

        ACTIVE = true;
      },
    );

    const scripts = getCosmeticsFiltersFirst();
    if (scripts) {
      for (const script of scripts) {
        injectScript(script, document);
      }
    }

    // On DOMContentLoaded, start monitoring the DOM. This means that we will
    // first check which ids and classes exist in the DOM as a one-off operation;
    // this will allow the injection of selectors which have a chance to match.
    // We also register a MutationObserver which will monitor the addition of new
    // classes and ids, and might trigger extra filters on a per-need basis.
    window.addEventListener(
      'DOMContentLoaded',
      () => {
        DOM_MONITOR = new DOMMonitor((update) => {
          if (update.type === 'features') {
            getCosmeticsFiltersUpdate({
              ...update,
            });
          }
        });

        DOM_MONITOR.queryAll(window);

        // Start observing mutations to detect new ids and classes which would
        // need to be hidden.
        if (ACTIVE && enableMutationObserver) {
          DOM_MONITOR.start(window);
        }
      },
      { once: true, passive: true },
    );

    window.addEventListener('unload', unload, { once: true, passive: true });
  })();
}

// Re-export symbols for convenience
export type { IBackgroundCallback, IMessageFromBackground } from '@cliqz/adblocker-content';
