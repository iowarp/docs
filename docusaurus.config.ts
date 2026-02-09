import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const config: Config = {
  title: 'IOWarp Documentation',
  tagline: 'Technical documentation for the IOWarp context engineering platform',
  favicon: 'img/favicons/favicon.ico',

  // Future flags, see https://docusaurus.io/docs/api/docusaurus-config#future
  future: {
    v4: {
      removeLegacyPostBuildHeadAttribute: true,
    },
    experimental_faster: {
      ssgWorkerThreads: true,
    },
  },

  // Set the production url of your site here
  url: 'https://docs.iowarp.ai',
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: '/',

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: 'iowarp', // Usually your GitHub org/user name.
  projectName: 'docs', // Usually your repo name.

  markdown: {
    mermaid: true,
  },
  
  trailingSlash: false,

  onBrokenLinks: 'warn',

  // SEO metadata
  headTags: [
    {
      tagName: 'meta',
      attributes: {
        name: 'description',
        content: 'Technical documentation for the IOWarp context engineering platform. CLIO Agent framework, context orchestration, SDK, API reference, and deployment guides.',
      },
    },
    {
      tagName: 'meta',
      attributes: {
        name: 'keywords',
        content: 'IOWarp documentation, context engineering, agentic AI, CLIO Agent, CLIO Kit, Model Context Protocol, MCP, SDK, API reference, deployment, HPC, scientific computing',
      },
    },
    {
      tagName: 'meta',
      attributes: {
        name: 'author',
        content: 'IOWarp Project - Gnosis Research Center, Illinois Institute of Technology',
      },
    },
    {
      tagName: 'meta',
      attributes: {
        property: 'og:title',
        content: 'IOWarp Documentation',
      },
    },
    {
      tagName: 'meta',
      attributes: {
        property: 'og:description',
        content: 'Technical documentation for the IOWarp context engineering platform. CLIO Agent framework, context orchestration, SDK, API reference, and deployment guides.',
      },
    },
    {
      tagName: 'meta',
      attributes: {
        property: 'og:type',
        content: 'website',
      },
    },
    {
      tagName: 'meta',
      attributes: {
        property: 'og:url',
        content: 'https://docs.iowarp.ai',
      },
    },
    {
      tagName: 'meta',
      attributes: {
        property: 'og:image',
        content: 'https://docs.iowarp.ai/img/iowarp_logo.png',
      },
    },
    {
      tagName: 'meta',
      attributes: {
        property: 'og:image:width',
        content: '800',
      },
    },
    {
      tagName: 'meta',
      attributes: {
        property: 'og:image:height',
        content: '800',
      },
    },
    {
      tagName: 'meta',
      attributes: {
        property: 'og:image:alt',
        content: 'IOWarp Logo - Technical Documentation',
      },
    },
    {
      tagName: 'meta',
      attributes: {
        property: 'og:image:type',
        content: 'image/png',
      },
    },
    {
      tagName: 'meta',
      attributes: {
        name: 'twitter:card',
        content: 'summary_large_image',
      },
    },
    {
      tagName: 'meta',
      attributes: {
        name: 'twitter:title',
        content: 'IOWarp Documentation',
      },
    },
    {
      tagName: 'meta',
      attributes: {
        name: 'twitter:description',
        content: 'Technical documentation for the IOWarp context engineering platform. CLIO Agent framework, SDK, API reference, and deployment guides.',
      },
    },
    {
      tagName: 'meta',
      attributes: {
        name: 'twitter:image',
        content: 'https://docs.iowarp.ai/img/iowarp_logo.png',
      },
    },
    {
      tagName: 'meta',
      attributes: {
        name: 'twitter:image:alt',
        content: 'IOWarp Logo - Technical Documentation',
      },
    },
    {
      tagName: 'meta',
      attributes: {
        name: 'robots',
        content: 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1',
      },
    },
    // Performance optimization: Preconnect to external domains
    {
      tagName: 'link',
      attributes: {
        rel: 'preconnect',
        href: 'https://fonts.googleapis.com',
      },
    },
    {
      tagName: 'link',
      attributes: {
        rel: 'dns-prefetch',
        href: 'https://github.com',
      },
    },
  ],

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  plugins: [],

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl:
            'https://github.com/iowarp/docs/tree/main/',
        },
        blog: false, // Blog removed - news lives on iowarp.ai
        theme: {
          customCss: './src/css/custom.css',
        },
        sitemap: {
          changefreq: 'weekly',
          priority: 0.5,
          ignorePatterns: ['/tags/**'],
          filename: 'sitemap.xml',
        },
      } satisfies Preset.Options,
    ],
  ],

  themes: ['@docusaurus/theme-mermaid'],

  themeConfig: {
    // Social card for link previews
    image: 'img/iowarp_logo.png',
    colorMode: {
      defaultMode: 'dark',
      respectPrefersColorScheme: false,
    },
    navbar: {
      title: 'IOWarp Docs',
      logo: {
        alt: 'IOWarp Logo',
        src: 'img/iowarp_logo.png',
      },
      items: [
        {
          type: 'doc',
          docId: 'getting-started/installation',
          position: 'left',
          label: 'Getting Started',
        },
        {
          type: 'doc',
          docId: 'sdk/interprocess',
          position: 'left',
          label: 'SDK',
        },
        {
          type: 'doc',
          docId: 'api/python-api',
          position: 'left',
          label: 'API Reference',
        },
        {
          type: 'doc',
          docId: 'deployment/hpc-cluster',
          position: 'left',
          label: 'Deployment',
        },
        {
          type: 'doc',
          docId: 'faq/index',
          position: 'left',
          label: 'FAQ',
        },
        {
          href: 'https://iowarp.ai',
          label: 'iowarp.ai',
          position: 'right',
        },
        {
          href: 'https://toolkit.iowarp.ai',
          label: 'toolkit.iowarp.ai',
          position: 'right',
        },
        {
          href: 'https://github.com/iowarp',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: ' ',
          items: [
            {
              html: `
                <div style="display: flex; align-items: center; flex-direction: row; justify-content: left; padding: 1rem;">
                  <div style="display: flex; flex-direction: column; align-items: center;">
                    <img
                        src="/img/iowarp_logo.png"
                        alt="IOWarp Logo"
                        style="height: 100px; width: auto;"
                      />
                  </div> 
                  <div style="display: flex; flex-direction: column; align-items: center;">
                    <span style="font-size: 1.25rem; font-weight: bold;">IOWarp</span>
                  </div>                  
                </div>
              `,
            },
          ],
        },
        {
          title: 'Documentation',
          items: [
            {
              label: 'Getting Started',
              to: '/docs/getting-started/installation',
            },
            {
              label: 'SDK',
              to: '/docs/sdk/interprocess',
            },
            {
              label: 'API Reference',
              to: '/docs/api/python-api',
            },
            {
              label: 'Deployment',
              to: '/docs/deployment/hpc-cluster',
            },
            {
              label: 'FAQ',
              to: '/docs/faq',
            },
          ],
        },
        {
          title: 'Platform',
          items: [
            {
              label: 'iowarp.ai',
              href: 'https://iowarp.ai',
            },
            {
              label: 'CLIO Kit',
              href: 'https://toolkit.iowarp.ai',
            },
            {
              label: 'GitHub',
              href: 'https://github.com/iowarp',
            },
          ],
        },
        {
          title: 'Connect',
          items: [
            {
              label: 'Zulip Chat',
              href: 'https://iowarp.zulipchat.com',
            },
            {
              label: 'GitHub Discussions',
              href: 'https://github.com/orgs/iowarp/discussions',
            },
          ],
        },
      ],
      copyright: `Gnosis Research Center | © ${new Date().getFullYear()} IOWarp Project | BSD 3-Clause License`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.vsDark,
      additionalLanguages: ['python', 'bash', 'json', 'yaml', 'toml', 'cpp', 'c'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
