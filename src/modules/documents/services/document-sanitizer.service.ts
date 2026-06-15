// Service cleaning up online document HTML, securing and filtering unwanted elements.
import { Injectable } from '@nestjs/common';
import sanitizeHtml = require('sanitize-html');

@Injectable()
export class DocumentSanitizerService {
  sanitizeContent(html: string): string {
    return sanitizeHtml(html, {
      allowedTags: [
        'h1',
        'h2',
        'h3',
        'p',
        'ul',
        'ol',
        'li',
        'strong',
        'em',
        'u',
        's',
        'code',
        'pre',
        'blockquote',
        'a',
        'img',
        'table',
        'thead',
        'tbody',
        'tr',
        'th',
        'td',
        'br',
        'span',
      ],
      allowedAttributes: {
        a: ['href', 'name', 'target', 'rel'],
        img: [
          'src',
          'alt',
          'title',
          'width',
          'height',
          'style',
          'data-align',
          'data-caption',
          'data-uploading',
        ],
        span: ['class'],
      },
      allowedStyles: {
        img: {
          width: [/^\d+(?:\.\d+)?px$/, /^\d+(?:\.\d+)?%$/],
          height: [/^auto$/],
          'max-width': [/^100%$/],
          margin: [/^0 auto$/, /^0 auto 0 0$/, /^0 0 0 auto$/],
        },
      },
      allowedSchemes: ['http', 'https', 'mailto'],
      allowedSchemesByTag: {
        img: ['http', 'https', 'data'],
      },
      transformTags: {
        a: (tagName, attribs) => ({
          tagName,
          attribs: {
            ...attribs,
            rel: 'noopener noreferrer',
          },
        }),
      },
    });
  }
}
