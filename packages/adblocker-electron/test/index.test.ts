import { expect } from 'chai';
import 'mocha';

import {
  ElectronBlocker,
  ElectronRequestType,
  fromElectronDetails,
  getHostnameHashesFromLabelsBackward,
} from '../src/index.js';

describe('#fromElectronDetails', () => {
  const baseRequest: Electron.OnBeforeRequestListenerDetails = {
    id: 0,
    method: 'GET',
    referrer: 'https://sub.source.com',
    resourceType: 'script' as ElectronRequestType,
    timestamp: 0,
    uploadData: [],
    url: 'https://sub.url.com',
  };

  it('gets sourceUrl from referrer', () => {
    expect(fromElectronDetails(baseRequest)).to.deep.include({
      sourceHostnameHashes: getHostnameHashesFromLabelsBackward('sub.source.com', 'source.com'),
    });
  });

  it('gets type from resourceType', () => {
    expect(fromElectronDetails(baseRequest)).to.deep.include({
      type: 'script',
    });
  });

  it('gets url from url', () => {
    expect(fromElectronDetails(baseRequest)).to.deep.include({
      domain: 'url.com',
      hostname: 'sub.url.com',
      url: 'https://sub.url.com',
    });
  });
});

describe('#constructor', () => {
  describe('mutationObserver', () => {
    it('defaults to true', () => {
      expect(new ElectronBlocker().config.enableMutationObserver).to.be.true;
      expect(new ElectronBlocker({}).config.enableMutationObserver).to.be.true;
    });

    it('can be set to false', () => {
      expect(
        new ElectronBlocker({ config: { enableMutationObserver: false } }).config
          .enableMutationObserver,
      ).to.be.false;
    });
  });
});

describe('#parse', () => {
  describe('mutationObserver', () => {
    it('defaults to true', () => {
      expect(ElectronBlocker.parse('').config.enableMutationObserver).to.be.true;
      expect(ElectronBlocker.parse('', {}).config.enableMutationObserver).to.be.true;
    });

    it('can be set to false', () => {
      expect(
        ElectronBlocker.parse('', { enableMutationObserver: false }).config.enableMutationObserver,
      ).to.be.false;
    });
  });
});

describe('#insertNode', () => {
  it('should append node to document head', () => {
    const document = {
      head: {
        appendChild: (node: Node) => {
          expect(node).to.equal('testNode');
        },
      },
    } as unknown as Document;

    const node = 'testNode' as unknown as Node;
    insertNode(node, document);
  });

  it('should handle CSP violation gracefully', () => {
    const document = {
      head: {
        appendChild: () => {
          throw new Error('CSP violation');
        },
      },
      createElement: () => ({
        style: {},
        contentDocument: {
          open: () => {},
          write: () => {},
          body: {
            appendChild: (node: Node) => {
              expect(node).to.equal('testNode');
            },
          },
          close: () => {},
        },
        contentWindow: {
          document: {
            open: () => {},
            write: () => {},
            body: {
              appendChild: (node: Node) => {
                expect(node).to.equal('testNode');
              },
            },
            close: () => {},
          },
        },
      }),
      body: {
        appendChild: () => {},
        removeChild: () => {},
      },
    } as unknown as Document;

    const node = 'testNode' as unknown as Node;
    insertNode(node, document);
  });
});

describe('#injectScript', () => {
  it('should inject script in non-Firefox browsers', () => {
    const document = {
      createElement: () => ({
        type: '',
        id: '',
        async: false,
        appendChild: (node: Node) => {
          expect(node).to.equal('testNode');
        },
      }),
      createTextNode: (script: string) => {
        expect(script).to.equal('testScript');
        return 'testNode' as unknown as Node;
      },
    } as unknown as Document;

    injectScript('testScript', document);
  });

  it('should inject script in Firefox browsers', async () => {
    const document = {
      defaultView: {
        navigator: {
          userAgent: 'Firefox',
        },
        Blob: class {
          constructor(public content: string[], public options: { type: string }) {}
        },
        URL: {
          createObjectURL: (blob: { content: string[]; options: { type: string } }) => {
            expect(blob.content).to.deep.equal(['testScript']);
            expect(blob.options.type).to.equal('text/javascript; charset=utf-8');
            return 'testUrl';
          },
          revokeObjectURL: (url: string) => {
            expect(url).to.equal('testUrl');
          },
        },
      },
      createElement: () => ({
        async: false,
        id: '',
        src: '',
        appendChild: () => {},
      }),
    } as unknown as Document;

    await injectScript('testScript', document);
  });
});
