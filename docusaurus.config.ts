import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'IOWarp Documentation',
  tagline: 'Technical documentation for the IOWarp context orchestration platform',
  favicon: 'img/iowarp_logo.png',

  future: {
    v4: true,
  },

  trailingSlash: false,

  url: 'https://docs.iowarp.ai',
  baseUrl: '/',

  organizationName: 'iowarp',
  projectName: 'docs',

  onBrokenLinks: 'throw',

  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          routeBasePath: 'docs',
          editUrl: 'https://github.com/iowarp/docs/tree/main/',
          showLastUpdateTime: false,
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    metadata: [
      {name: 'description', content: 'Technical documentation for the IOWarp context orchestration platform. Installation guides, SDK reference, API docs, deployment, and CLIO Kit MCP servers.'},
      {name: 'keywords', content: 'IOWarp, documentation, SDK, API, CLIO Kit, MCP servers, HPC, scientific computing, context engineering, Chimaera, installation'},
      {property: 'og:title', content: 'IOWarp Documentation'},
      {property: 'og:description', content: 'Technical documentation for the IOWarp context orchestration platform for agentic AI in scientific computing.'},
      {name: 'twitter:card', content: 'summary_large_image'},
    ],
    image: 'img/iowarp_logo.png',

    navbar: {
      title: 'IOWarp Docs',
      logo: {
        alt: 'IOWarp Logo',
        src: 'img/iowarp_logo.png',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Documentation',
        },
        {
          to: '/docs/getting-started/installation',
          position: 'left',
          label: 'Quick Start',
        },
        {
          to: '/docs/sdk/interprocess',
          position: 'left',
          label: 'SDK',
        },
        {
          to: '/docs/api/python',
          position: 'left',
          label: 'API',
        },
        {
          href: 'https://iowarp.ai',
          position: 'right',
          label: 'IOWarp',
        },
        {
          href: 'https://toolkit.iowarp.ai',
          position: 'right',
          label: 'CLIO Kit',
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
          title: 'Documentation',
          items: [
            {label: 'Getting Started', to: '/docs/getting-started/installation'},
            {label: 'SDK Reference', to: '/docs/sdk/interprocess'},
            {label: 'API Reference', to: '/docs/api/python'},
            {label: 'Deployment', to: '/docs/deployment/configuration'},
          ],
        },
        {
          title: 'IOWarp Platform',
          items: [
            {label: 'Website', href: 'https://iowarp.ai'},
            {label: 'CLIO Kit', href: 'https://toolkit.iowarp.ai'},
            {label: 'Research', href: 'https://iowarp.ai/research/'},
            {label: 'Demos', href: 'https://iowarp.ai/research/demos/'},
          ],
        },
        {
          title: 'Community',
          items: [
            {label: 'GitHub', href: 'https://github.com/iowarp'},
            {label: 'Issues', href: 'https://github.com/iowarp/iowarp/issues'},
            {label: 'Discussions', href: 'https://github.com/orgs/iowarp/discussions'},
            {label: 'Zulip Chat', href: 'https://iowarp.zulipchat.com'},
          ],
        },
        {
          title: 'Research & Funding',
          items: [
            {label: 'Gnosis Research Center', href: 'https://grc.iit.edu/'},
            {label: 'Illinois Tech', href: 'https://www.iit.edu/'},
            {label: 'National Science Foundation', href: 'https://new.nsf.gov/'},
          ],
        },
      ],
      copyright: `IOWarp Documentation · Developed by Gnosis Research Center (GRC), Illinois Institute of Technology. Funded in part by the National Science Foundation. BSD 3-Clause License. © ${new Date().getFullYear()}`,
    },

    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'cmake', 'yaml', 'json', 'python', 'cpp'],
    },

    colorMode: {
      defaultMode: 'dark',
      disableSwitch: false,
      respectPrefersColorScheme: true,
    },

    tableOfContents: {
      minHeadingLevel: 2,
      maxHeadingLevel: 4,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
