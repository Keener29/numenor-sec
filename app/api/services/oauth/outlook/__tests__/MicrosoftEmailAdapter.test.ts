/**
 * Microsoft Email Adapter Tests
 * Tests Graph message parsing and normalization
 */

import { describe, expect, it } from '@jest/globals';
import { parseGraphMessage } from '../MicrosoftEmailAdapter.js';
import type { GraphMessage } from '../types.js';

describe('MicrosoftEmailAdapter', () => {
  describe('parseGraphMessage', () => {
    it('should parse a complete Graph message', () => {
      const graphMessage: GraphMessage = {
        id: 'msg-123',
        subject: 'Test Subject',
        receivedDateTime: '2024-01-01T12:00:00Z',
        from: {
          emailAddress: {
            name: 'John Doe',
            address: 'john@example.com'
          }
        },
        toRecipients: [{
          emailAddress: {
            name: 'Jane Doe',
            address: 'jane@example.com'
          }
        }],
        body: {
          contentType: 'HTML',
          content: '<p>Test body with <a href="https://example.com">link</a></p>'
        },
        internetMessageHeaders: [
          { name: 'From', value: 'john@example.com' },
          { name: 'To', value: 'jane@example.com' }
        ],
        attachments: [
          { id: 'att-1', name: 'file.pdf', contentType: 'application/pdf', size: 1024 }
        ]
      };

      const result = parseGraphMessage(graphMessage, 'jane@example.com');

      expect(result.id).toBe('msg-123');
      expect(result.subject).toBe('Test Subject');
      expect(result.sender).toBe('John Doe <john@example.com>');
      expect(result.recipient).toBe('Jane Doe <jane@example.com>');
      expect(result.body).toContain('Test body');
      expect(result.links).toContain('https://example.com');
      expect(result.attachments).toEqual(['file.pdf']);
      expect(result.headers['from']).toBe('john@example.com');
      expect(result.timestamp).toEqual(new Date('2024-01-01T12:00:00Z'));
    });

    it('should handle missing subject', () => {
      const graphMessage: GraphMessage = {
        id: 'msg-123',
        receivedDateTime: '2024-01-01T12:00:00Z',
        from: {
          emailAddress: {
            address: 'john@example.com'
          }
        },
        toRecipients: [{
          emailAddress: {
            address: 'jane@example.com'
          }
        }],
        body: { contentType: 'HTML', content: 'Body' }
      };

      const result = parseGraphMessage(graphMessage);

      expect(result.subject).toBe('No Subject');
    });

    it('should use bodyPreview when body.content is missing', () => {
      const graphMessage: GraphMessage = {
        id: 'msg-123',
        subject: 'Test',
        receivedDateTime: '2024-01-01T12:00:00Z',
        bodyPreview: 'Preview text',
        from: {
          emailAddress: {
            address: 'john@example.com'
          }
        },
        toRecipients: [{
          emailAddress: {
            address: 'jane@example.com'
          }
        }]
      };

      const result = parseGraphMessage(graphMessage);

      expect(result.body).toBe('Preview text');
    });

    it('should prefer from over sender', () => {
      const graphMessage: GraphMessage = {
        id: 'msg-123',
        subject: 'Test',
        receivedDateTime: '2024-01-01T12:00:00Z',
        from: {
          emailAddress: {
            name: 'From Name',
            address: 'from@example.com'
          }
        },
        sender: {
          emailAddress: {
            name: 'Sender Name',
            address: 'sender@example.com'
          }
        },
        toRecipients: [{
          emailAddress: {
            address: 'jane@example.com'
          }
        }],
        body: { contentType: 'HTML', content: 'Body' }
      };

      const result = parseGraphMessage(graphMessage);

      expect(result.sender).toBe('From Name <from@example.com>');
    });

    it('should extract links from HTML body', () => {
      const graphMessage: GraphMessage = {
        id: 'msg-123',
        subject: 'Test',
        receivedDateTime: '2024-01-01T12:00:00Z',
        from: {
          emailAddress: {
            address: 'john@example.com'
          }
        },
        toRecipients: [{
          emailAddress: {
            address: 'jane@example.com'
          }
        }],
        body: {
          contentType: 'HTML',
          content: '<a href="https://link1.com">Link 1</a> Visit https://link2.com for more'
        }
      };

      const result = parseGraphMessage(graphMessage);

      expect(result.links).toContain('https://link1.com');
      expect(result.links).toContain('https://link2.com');
      expect(result.links?.length).toBe(2);
    });

    it('should handle missing optional fields', () => {
      const graphMessage: GraphMessage = {
        id: 'msg-123',
        receivedDateTime: '2024-01-01T12:00:00Z'
      };

      const result = parseGraphMessage(graphMessage, 'fallback@example.com');

      expect(result.sender).toBe('Unknown Sender');
      expect(result.recipient).toBe('fallback@example.com');
      expect(result.body).toBe('');
      expect(result.links).toEqual([]);
      expect(result.attachments).toBeUndefined();
    });

    it('should deduplicate links', () => {
      const graphMessage: GraphMessage = {
        id: 'msg-123',
        subject: 'Test',
        receivedDateTime: '2024-01-01T12:00:00Z',
        from: {
          emailAddress: {
            address: 'john@example.com'
          }
        },
        toRecipients: [{
          emailAddress: {
            address: 'jane@example.com'
          }
        }],
        body: {
          contentType: 'HTML',
          content: '<a href="https://example.com">Link</a> Visit https://example.com again'
        }
      };

      const result = parseGraphMessage(graphMessage);

      expect(result.links).toEqual(['https://example.com']);
    });
  });
});

